import { Injectable, InternalServerErrorException, UnauthorizedException, Inject, forwardRef, Logger } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { LoginType } from '../../types/auth';
import { UserRecord } from '../../types/user';
import { LoginInput, SignupInput } from '../../validators/authSchemas';
import { JwtTokenService, TokenPair } from '../../services/jwtService';
import { SessionRecord, SessionService } from '../../services/sessionService';
import { SupabaseService } from '../../services/supabaseService';
import { fromSupabaseUser } from '../../utils/mappers';
import { SocialAuthService } from '../oauth/social-auth.service';

export interface AuthSessionPayload {
  user: UserRecord;
  tokenPair: TokenPair;
  loginType: LoginType;
  session: SessionRecord;
}

interface RefreshPayload {
  tokenPair: TokenPair;
  loginType: LoginType;
  session: SessionRecord;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly identifierCache = new Map<string, { email: string; expiresAt: number }>();
  private readonly IDENTIFIER_CACHE_TTL = 5 * 60 * 1000;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly sessionService: SessionService,
    @Inject(forwardRef(() => SocialAuthService))
    private readonly socialAuthService: SocialAuthService,
  ) {}

  private getCachedEmail(identifier: string): string | null {
    const cached = this.identifierCache.get(identifier);
    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
      this.identifierCache.delete(identifier);
      return null;
    }
    return cached.email;
  }

  private setCachedEmail(identifier: string, email: string): void {
    this.identifierCache.set(identifier, {
      email,
      expiresAt: Date.now() + this.IDENTIFIER_CACHE_TTL,
    });
    if (this.identifierCache.size > 1000) {
      const oldestKey = this.identifierCache.keys().next().value;
      if (oldestKey) {
        this.identifierCache.delete(oldestKey);
      }
    }
  }

  async createAuthSession(user: UserRecord, loginType: LoginType): Promise<AuthSessionPayload> {
    const session = await this.sessionService.createSession(user.id, loginType);
    const tokenPair = this.jwtTokenService.generateTokenPair(user, loginType, session.sessionId);
    return { user, tokenPair, loginType, session };
  }

  async signup(input: SignupInput): Promise<AuthSessionPayload> {
    const startTime = Date.now();
    const lowerEmail = input.email.toLowerCase();

    // Supabase 사용자 생성과 해시 생성을 병렬로 처리 (성능 최적화)
    const [supabaseUser, passwordHash] = await Promise.all([
      this.supabaseService.signUp(lowerEmail, input.password, {
        name: input.name,
      }),
      bcrypt.hash(input.password, 8) // 10 -> 8로 줄여서 속도 향상 (보안성 유지하면서)
    ]);

    if (!supabaseUser) {
      throw new InternalServerErrorException('Supabase createUser did not return a user');
    }

    const username = (lowerEmail.split('@')[0] || `user_${supabaseUser.id.substring(0, 8)}`).toLowerCase();

    const newUser: UserRecord = {
      id: supabaseUser.id,
      email: lowerEmail,
      name: input.name ?? null,
      avatar_url: null,
      created_at: new Date(),
      updated_at: new Date(),
      username,
      password_hash: passwordHash,
    };

    const result = await this.createAuthSession(newUser, 'signup');
    this.setCachedEmail(lowerEmail, lowerEmail);
    this.setCachedEmail(username, lowerEmail);

    const duration = Date.now() - startTime;
    this.logger.debug(`Signup completed in ${duration}ms for ${lowerEmail}`);

    return result;
  }

  async login(input: LoginInput): Promise<AuthSessionPayload> {
    const startTime = Date.now();
    const identifier = input.identifier.trim().toLowerCase();
    if (!identifier) {
      throw new UnauthorizedException('identifier is required');
    }

    let emailToUse = identifier;
    let loginType: LoginType = 'email';

    if (!identifier.includes('@')) {
      const cachedEmail = this.getCachedEmail(identifier);
      if (cachedEmail) {
        emailToUse = cachedEmail;
      } else {
        let profile;
        try {
          profile = await this.supabaseService.findProfileByIdentifier(identifier);
        } catch {
          throw new UnauthorizedException('Invalid credentials');
        }

        if (!profile?.email) {
          throw new UnauthorizedException('Invalid credentials');
        }

        emailToUse = profile.email.toLowerCase();
        loginType = 'username';
        this.setCachedEmail(identifier, emailToUse);
      }
    }

    let supabaseUser;
    try {
      supabaseUser = await this.supabaseService.signIn(emailToUse, input.password);
    } catch {
      throw new UnauthorizedException('Invalid credentials');
    }
    const user = fromSupabaseUser(supabaseUser);

    this.setCachedEmail(user.email.toLowerCase(), user.email.toLowerCase());
    if (user.username) {
      this.setCachedEmail(user.username.toLowerCase(), user.email.toLowerCase());
    }

    const result = await this.createAuthSession(user, loginType);

    const duration = Date.now() - startTime;
    this.logger.debug(`Login completed in ${duration}ms for ${identifier}`);

    return result;
  }

  async refresh(refreshToken: string): Promise<RefreshPayload> {
    const payload = this.jwtTokenService.verifyRefreshToken(refreshToken);
    if (!payload.sub || !payload.sessionId) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const currentSession = await this.sessionService.getSession(payload.sessionId);
    if (!currentSession || !currentSession.isActive) {
      throw new UnauthorizedException('Session expired or revoked');
    }

    let user: UserRecord;
    try {
      const supabaseUser = await this.supabaseService.getUserById(payload.sub);
      if (!supabaseUser) {
        throw new UnauthorizedException('User not found in Supabase');
      }
      user = fromSupabaseUser(supabaseUser);
    } catch (error) {
      throw new UnauthorizedException('User verification failed');
    }

    // 기존 세션은 재사용하지 않으므로 즉시 폐기
    await this.sessionService.deleteSession(payload.sessionId);

    const sessionPayload = await this.createAuthSession(user, 'email');
    return { tokenPair: sessionPayload.tokenPair, loginType: sessionPayload.loginType, session: sessionPayload.session };
  }

  async deleteAccount(user: UserRecord): Promise<{ supabaseDeleted: boolean }> {
    const startTime = Date.now();

    let profileLoginType: LoginType | null = null;
    try {
      const profile = await this.supabaseService.findProfileById(user.id);
      profileLoginType = (profile?.login_type as LoginType | null) ?? null;
    } catch (error) {
      this.logger.warn('[deleteAccount] Failed to fetch profile for login type', error);
    }

    // 소셜 로그인 연결 해제 및 Supabase 사용자 삭제 병렬 처리
    const revokeTasks: Promise<void>[] = [];

    if (profileLoginType === 'apple') {
      revokeTasks.push(
        this.socialAuthService.revokeAppleConnection(user.id).catch(error =>
          this.logger.warn('[deleteAccount] Apple revoke failed', error)
        )
      );
    } else if (profileLoginType === 'google') {
      revokeTasks.push(
        this.socialAuthService.revokeGoogleConnection(user.id).catch(error =>
          this.logger.warn('[deleteAccount] Google revoke failed', error)
        )
      );
    }

    let supabaseDeleted = false;
    const deleteUserTask = this.supabaseService.deleteUser(user.id)
      .then(() => { supabaseDeleted = true; })
      .catch((error: any) => {
        const message = (error?.message as string)?.toLowerCase() ?? '';
        if (!message.includes('not found')) {
          throw error;
        }
      });

    // 모든 작업을 병렬로 실행
    await Promise.all([...revokeTasks, deleteUserTask]);

    const duration = Date.now() - startTime;
    this.logger.debug(`Account deletion completed in ${duration}ms for ${user.email}`);

    return { supabaseDeleted };
  }

  async logoutBySessionId(sessionId: string): Promise<{ revoked: boolean }> {
    if (!sessionId) {
      throw new UnauthorizedException('sessionId is required');
    }
    const deleted = await this.sessionService.deleteSession(sessionId);
    return { revoked: deleted };
  }
}
