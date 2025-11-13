import { Injectable, ServiceUnavailableException, UnauthorizedException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { LoginType } from '../../types/auth';
import { SupabaseService } from '../../services/supabaseService';
import { AuthService, AuthSessionPayload } from '../auth/auth.service';
import { fromSupabaseUser } from '../../utils/mappers';
import { env } from '../../config/env';

export interface SocialLookupResult {
  registered: boolean;
}

@Injectable()
export class SocialAuthService {
  constructor(
    private readonly supabaseService: SupabaseService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
  ) {}

  private ensureAppleEnv() {
    if (!env.appleClientId || !env.appleTeamId || !env.appleKeyId || !env.applePrivateKey) {
      throw new ServiceUnavailableException('Apple credentials are not configured');
    }
  }

  private buildAppleClientSecret() {
    this.ensureAppleEnv();
    const privateKey = env.applePrivateKey!.replace(/\\n/g, '\n');
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
      {
        iss: env.appleTeamId,
        iat: now,
        exp: now + 60 * 10,
        aud: 'https://appleid.apple.com',
        sub: env.appleClientId,
      },
      privateKey,
      {
        algorithm: 'ES256',
        keyid: env.appleKeyId!,
      },
    );
  }

  async loginWithOAuthToken(
    accessToken: string,
    loginType: LoginType = 'email',
    appleRefreshToken?: string | null,
    authorizationCode?: string | null,
  ): Promise<AuthSessionPayload> {
    if (!accessToken) {
      throw new UnauthorizedException('Missing Supabase access token');
    }
    const supabaseUser = await this.supabaseService.getUserFromToken(accessToken);
    if (!supabaseUser) {
      throw new UnauthorizedException('Invalid Supabase access token');
    }
    await this.supabaseService.ensureProfileFromSupabaseUser(supabaseUser, loginType);
    const preferDisplayName = loginType !== 'email' && loginType !== 'username';
    const user = fromSupabaseUser(supabaseUser, { preferDisplayName });
    let finalAppleRefreshToken = appleRefreshToken;
    if (loginType === 'apple' && !finalAppleRefreshToken && authorizationCode) {
      finalAppleRefreshToken = await this.exchangeAppleAuthorizationCode(authorizationCode);
    }
    if (loginType === 'apple' && finalAppleRefreshToken) {
      await this.supabaseService.saveAppleRefreshToken(user.id, finalAppleRefreshToken);
    }
    return this.authService.createAuthSession(user, loginType);
  }

  async checkOAuthAccount(
    accessToken: string,
    loginType: LoginType = 'email',
  ): Promise<SocialLookupResult> {
    if (!accessToken) {
      throw new UnauthorizedException('Missing Supabase access token');
    }
    const supabaseUser = await this.supabaseService.getUserFromToken(accessToken);
    if (!supabaseUser || !supabaseUser.id || !supabaseUser.email) {
      throw new UnauthorizedException('Invalid Supabase access token');
    }

    const profile = await this.supabaseService.findProfileById(supabaseUser.id);
    return { registered: Boolean(profile) };
  }

  async revokeAppleConnection(userId: string, refreshToken?: string): Promise<void> {
    const tokenToUse =
      refreshToken ??
      (await this.supabaseService.getAppleRefreshToken(userId)) ??
      null;
    if (!tokenToUse) {
      throw new BadRequestException('Apple refresh token is required');
    }
    this.ensureAppleEnv();
    const clientSecret = this.buildAppleClientSecret();

    const body = new URLSearchParams({
      token: tokenToUse,
      token_type_hint: 'refresh_token',
      client_id: env.appleClientId!,
      client_secret: clientSecret,
    });

    const response = await fetch('https://appleid.apple.com/auth/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ServiceUnavailableException(`Apple revoke failed: ${response.status} ${text}`);
    }
    await this.supabaseService.saveAppleRefreshToken(userId, null);
  }

  private async exchangeAppleAuthorizationCode(code: string): Promise<string> {
    this.ensureAppleEnv();
    const clientSecret = this.buildAppleClientSecret();
    const body = new URLSearchParams({
      client_id: env.appleClientId!,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    });

    const response = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ServiceUnavailableException(`Apple token exchange failed: ${response.status} ${text}`);
    }
    const result = (await response.json()) as { refresh_token?: string };
    if (!result.refresh_token) {
      throw new ServiceUnavailableException('Apple did not return a refresh_token');
    }
    return result.refresh_token;
  }
}
