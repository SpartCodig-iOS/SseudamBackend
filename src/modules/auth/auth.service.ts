import { Injectable, InternalServerErrorException, UnauthorizedException, Inject, forwardRef } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { LoginType } from '../../types/auth';
import { UserRecord } from '../../types/user';
import { LoginInput, SignupInput } from '../../validators/authSchemas';
import { SessionData, SessionService } from '../../services/sessionService';
import { JwtTokenService, TokenPair } from '../../services/jwtService';
import { SupabaseService } from '../../services/supabaseService';
import { fromSupabaseUser } from '../../utils/mappers';
import { SocialAuthService } from '../oauth/social-auth.service';

export interface AuthSessionPayload {
  user: UserRecord;
  tokenPair: TokenPair;
  session: SessionData;
  loginType: LoginType;
}

interface RefreshPayload {
  tokenPair: TokenPair;
  session: SessionData;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly sessionService: SessionService,
    @Inject(forwardRef(() => SocialAuthService))
    private readonly socialAuthService: SocialAuthService,
  ) {}

  createAuthSession(user: UserRecord, loginType: LoginType): AuthSessionPayload {
    const tokenPair = this.jwtTokenService.generateTokenPair(user, loginType);
    const session = this.sessionService.createSession(user, loginType);
    return { user, tokenPair, session, loginType };
  }

  async signup(input: SignupInput): Promise<AuthSessionPayload> {
    const lowerEmail = input.email.toLowerCase();
    const supabaseUser = await this.supabaseService.signUp(lowerEmail, input.password, {
      name: input.name,
    });

    if (!supabaseUser) {
      throw new InternalServerErrorException('Supabase createUser did not return a user');
    }

    const username = (lowerEmail.split('@')[0] || `user_${supabaseUser.id.substring(0, 8)}`).toLowerCase();
    const passwordHash = await bcrypt.hash(input.password, 10);

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

    return this.createAuthSession(newUser, 'signup');
  }

  async login(input: LoginInput): Promise<AuthSessionPayload> {
    const identifier = input.identifier.trim().toLowerCase();
    if (!identifier) {
      throw new UnauthorizedException('email and password are required');
    }

    let emailToUse = identifier;
    let loginType: LoginType = 'email';

    if (!identifier.includes('@')) {
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
    }

    let supabaseUser;
    try {
      supabaseUser = await this.supabaseService.signIn(emailToUse, input.password);
    } catch {
      throw new UnauthorizedException('Invalid credentials');
    }
    const user = fromSupabaseUser(supabaseUser);

    return this.createAuthSession(user, loginType);
  }

  async refresh(refreshToken: string): Promise<RefreshPayload> {
    const payload = this.jwtTokenService.verifyRefreshToken(refreshToken);
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid refresh token');
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

    const sessionPayload = this.createAuthSession(user, 'email');
    return { tokenPair: sessionPayload.tokenPair, session: sessionPayload.session };
  }

  async deleteAccount(user: UserRecord): Promise<{ supabaseDeleted: boolean }> {
    let profileLoginType: LoginType | null = null;
    try {
      const profile = await this.supabaseService.findProfileById(user.id);
      profileLoginType = (profile?.login_type as LoginType | null) ?? null;
    } catch (error) {
      console.warn('[deleteAccount] Failed to fetch profile for login type', error);
    }

    if (profileLoginType === 'apple') {
      try {
        await this.socialAuthService.revokeAppleConnection(user.id);
      } catch (error) {
        console.warn('[deleteAccount] Apple revoke failed', error);
      }
    }
    let supabaseDeleted = false;
    try {
      await this.supabaseService.deleteUser(user.id);
      supabaseDeleted = true;
    } catch (error: any) {
      const message = (error?.message as string)?.toLowerCase() ?? '';
      if (!message.includes('not found')) {
        throw error;
      }
    }

    return { supabaseDeleted };
  }

}
