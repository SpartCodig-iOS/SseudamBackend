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
import { getPool } from '../../db/pool';

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

  private async lookupEmailByIdentifier(identifier: string): Promise<string | null> {
    const pool = await getPool();
    const result = await pool.query(
      `SELECT email
       FROM profiles
       WHERE username = $1
          OR email ILIKE $2
       ORDER BY CASE WHEN username = $1 THEN 0 ELSE 1 END
       LIMIT 1`,
      [identifier, `${identifier}@%`],
    );
    return result.rows[0]?.email?.toLowerCase() ?? null;
  }

  // 고성능 직접 인증: 단일 쿼리로 사용자 정보 조회 및 비밀번호 확인
  private async authenticateUserDirect(email: string, password: string): Promise<UserRecord | null> {
    const authStartTime = Date.now();
    const pool = await getPool();

    // 최적화된 단일 쿼리 (서브쿼리 제거, 더 빠름)
    // password_hash 컬럼이 존재하지 않을 수 있으므로 안전하게 처리
    let result;
    try {
      result = await pool.query(
        `SELECT
           id::text,
           email,
           name,
           username,
           avatar_url,
           created_at,
           updated_at,
           password_hash
         FROM profiles
         WHERE email = $1
         LIMIT 1`,
        [email.toLowerCase()]
      );
    } catch (error) {
      // password_hash 컬럼이 없는 경우 없이 조회
      if (error instanceof Error && error.message.includes('password_hash')) {
        result = await pool.query(
          `SELECT
             id::text,
             email,
             name,
             username,
             avatar_url,
             created_at,
             updated_at
           FROM profiles
           WHERE email = $1
           LIMIT 1`,
          [email.toLowerCase()]
        );
      } else {
        throw error;
      }
    }

    const row = result.rows[0];
    if (!row) return null;

    // 비밀번호 확인을 병렬로 처리할 수 있도록 준비
    let isValidPassword = false;

    if (row.password_hash) {
      // bcrypt 검증 (가장 빠른 방법)
      isValidPassword = await bcrypt.compare(password, row.password_hash);
    } else {
      // Supabase 인증으로 폴백 (password_hash가 없는 경우)
      try {
        await this.supabaseService.signIn(email, password);
        isValidPassword = true;
      } catch {
        isValidPassword = false;
      }
    }

    if (!isValidPassword) return null;

    const authDuration = Date.now() - authStartTime;
    this.logger.debug(`Fast auth completed in ${authDuration}ms for ${email}`);

    return {
      id: row.id,
      email: row.email,
      name: row.name,
      username: row.username,
      avatar_url: row.avatar_url,
      created_at: row.created_at,
      updated_at: row.updated_at,
      password_hash: '', // 보안상 빈 값으로 설정
    };
  }

  async createAuthSession(user: UserRecord, loginType: LoginType): Promise<AuthSessionPayload> {
    const startTime = Date.now();

    // 세션 생성과 토큰 생성을 병렬로 처리 (성능 최적화)
    const [session] = await Promise.all([
      this.sessionService.createSession(user.id, loginType)
    ]);

    // 세션 ID를 받은 후 토큰 생성
    const tokenPair = this.jwtTokenService.generateTokenPair(user, loginType, session.sessionId);

    const duration = Date.now() - startTime;
    this.logger.debug(`Auth session created in ${duration}ms for user ${user.id}`);

    return { user, tokenPair, loginType, session };
  }

  async signup(input: SignupInput): Promise<AuthSessionPayload> {
    const startTime = Date.now();
    const lowerEmail = input.email.toLowerCase();

    // 모든 작업을 병렬로 처리 (성능 최적화)
    const [supabaseUser, passwordHash] = await Promise.all([
      this.supabaseService.signUp(lowerEmail, input.password, {
        name: input.name,
      }),
      bcrypt.hash(input.password, 6) // 8 -> 6으로 더 단축 (회원가입 속도 우선)
    ]);

    if (!supabaseUser) {
      throw new InternalServerErrorException('Supabase createUser did not return a user');
    }

    // username 생성 최적화
    const username = lowerEmail.includes('@')
      ? lowerEmail.split('@')[0].toLowerCase()
      : `user_${supabaseUser.id.substring(0, 8)}`;

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

    // 세션 생성과 캐시 업데이트를 병렬로 처리
    const [result] = await Promise.all([
      this.createAuthSession(newUser, 'signup'),
      // 캐시 업데이트는 동기적으로 빠르므로 Promise로 감쌀 필요 없음
      Promise.resolve().then(() => {
        this.setCachedEmail(lowerEmail, lowerEmail);
        this.setCachedEmail(username, lowerEmail);
      })
    ]);

    const duration = Date.now() - startTime;
    this.logger.debug(`Fast signup completed in ${duration}ms for ${lowerEmail}`);

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

    // 이메일이 아닌 경우 (username) 캐시에서 먼저 확인
    if (!identifier.includes('@')) {
      const cachedEmail = this.getCachedEmail(identifier);
      if (cachedEmail) {
        emailToUse = cachedEmail;
        loginType = 'username';
      } else {
        const lookedUpEmail = await this.lookupEmailByIdentifier(identifier);
        if (!lookedUpEmail) {
          throw new UnauthorizedException('Invalid credentials');
        }
        emailToUse = lookedUpEmail;
        loginType = 'username';
        this.setCachedEmail(identifier, emailToUse);
      }
    }

    // 고성능 직접 인증: Supabase 대신 직접 DB 쿼리 (더 빠름)
    const user = await this.authenticateUserDirect(emailToUse, input.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 캐시 업데이트 (다음 로그인 시 더 빠르게)
    this.setCachedEmail(user.email.toLowerCase(), user.email.toLowerCase());
    if (user.username) {
      this.setCachedEmail(user.username.toLowerCase(), user.email.toLowerCase());
    }

    const result = await this.createAuthSession(user, loginType);

    const duration = Date.now() - startTime;
    this.logger.debug(`Fast login completed in ${duration}ms for ${identifier}`);

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

    const pool = await getPool();

    // 프로필 타입 조회
    let profileLoginType: LoginType | null = null;
    try {
      const profile = await this.supabaseService.findProfileById(user.id);
      profileLoginType = (profile?.login_type as LoginType | null) ?? null;
    } catch (error) {
      this.logger.warn('[deleteAccount] Failed to fetch profile for login type', error as Error);
    }

    // 1) 지출/참여 기록 제거
    await pool.query('DELETE FROM travel_expense_participants WHERE member_id = $1', [user.id]);
    await pool.query('DELETE FROM travel_expenses WHERE payer_id = $1', [user.id]);

    // 2) 여행 멤버/초대/세션 제거
    await pool.query('DELETE FROM travel_members WHERE user_id = $1', [user.id]);
    await pool.query('DELETE FROM travel_invites WHERE created_by = $1', [user.id]);
    await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [user.id]);

    // 3) 소셜 연결 해제
    if (profileLoginType === 'apple') {
      await this.socialAuthService
        .revokeAppleConnection(user.id)
        .catch((error) => this.logger.warn('[deleteAccount] Apple revoke failed', error));
    } else if (profileLoginType === 'google') {
      await this.socialAuthService
        .revokeGoogleConnection(user.id)
        .catch((error) => this.logger.warn('[deleteAccount] Google revoke failed', error));
    }

    // 4) 프로필 삭제
    await pool.query('DELETE FROM profiles WHERE id = $1', [user.id]);

    // 5) Supabase 사용자 삭제
    let supabaseDeleted = false;
    try {
      await this.supabaseService.deleteUser(user.id);
      supabaseDeleted = true;
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
      if (!message.includes('not found')) {
        this.logger.warn('[deleteAccount] Supabase deletion failed', error);
      } else {
        supabaseDeleted = true;
      }
    }

    // 캐시에서도 제거
    this.identifierCache.delete(user.email.toLowerCase());
    if (user.username) {
      this.identifierCache.delete(user.username.toLowerCase());
    }

    const duration = Date.now() - startTime;
    this.logger.debug(`Fast account deletion completed in ${duration}ms for ${user.email}`);

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
