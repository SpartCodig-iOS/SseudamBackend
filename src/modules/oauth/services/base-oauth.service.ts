import { Logger } from '@nestjs/common';

export interface OAuthUserInfo {
  id: string;
  email: string;
  nickname?: string;
  profileImageUrl?: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  id_token?: string;
}

export interface OAuthTokenOptions {
  authorizationCode?: string | null;
  codeVerifier?: string | null;
  redirectUri?: string | null;
  refreshToken?: string | null;
  appleRefreshToken?: string | null;
  googleRefreshToken?: string | null;
  kakaoRefreshToken?: string | null;
}

export abstract class BaseOAuthService {
  protected readonly logger = new Logger(this.constructor.name);

  abstract getAuthUrl(options?: Record<string, any>): string;
  abstract exchangeCodeForTokens(code: string, options?: OAuthTokenOptions): Promise<OAuthTokenResponse>;
  abstract getUserInfo(accessToken: string): Promise<OAuthUserInfo>;
  abstract refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse>;
  abstract revokeToken(token: string): Promise<void>;

  protected generateState(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  protected validateState(state: string): boolean {
    // Basic state validation - you might want to store and validate against actual state
    return Boolean(state && state.length >= 10);
  }
}