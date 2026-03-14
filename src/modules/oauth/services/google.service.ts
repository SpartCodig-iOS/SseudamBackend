import { Injectable, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { BaseOAuthService, OAuthUserInfo, OAuthTokenResponse, OAuthTokenOptions } from './base-oauth.service';
import { env } from '../../../config/env';

@Injectable()
export class GoogleOAuthService extends BaseOAuthService {
  private readonly clientId = env.googleClientId;
  private readonly clientSecret = env.googleClientSecret;
  private readonly baseUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  private readonly tokenUrl = 'https://oauth2.googleapis.com/token';
  private readonly userInfoUrl = 'https://www.googleapis.com/oauth2/v1/userinfo';
  private readonly revokeUrl = 'https://oauth2.googleapis.com/revoke';

  getAuthUrl(options?: { redirectUri?: string; state?: string; scope?: string }): string {
    const params = new URLSearchParams();
    params.append('client_id', this.clientId || '');
    params.append('redirect_uri', options?.redirectUri || `${env.appBaseUrl}/auth/google/callback`);
    params.append('response_type', 'code');
    params.append('scope', options?.scope || 'openid email profile');
    params.append('state', options?.state || this.generateState());
    params.append('access_type', 'offline');
    params.append('prompt', 'consent');

    return `${this.baseUrl}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string, options?: OAuthTokenOptions): Promise<OAuthTokenResponse> {
    try {
      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams([
          ['client_id', this.clientId || ''],
          ['client_secret', this.clientSecret || ''],
          ['code', code],
          ['grant_type', 'authorization_code'],
          ['redirect_uri', options?.redirectUri || `${env.appBaseUrl}/auth/google/callback`],
        ]),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Google token exchange failed: ${error}`);
        throw new BadRequestException('Google token exchange failed');
      }

      const tokens = await response.json() as OAuthTokenResponse;
      this.logger.log('Google token exchange successful');
      return tokens;
    } catch (error) {
      this.logger.error('Google token exchange error:', error);
      throw new ServiceUnavailableException('Google OAuth service unavailable');
    }
  }

  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    try {
      const response = await fetch(`${this.userInfoUrl}?access_token=${accessToken}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Google user info fetch failed: ${error}`);
        throw new BadRequestException('Failed to get Google user info');
      }

      const userData = await response.json() as any;

      return {
        id: userData.id,
        email: userData.email,
        nickname: userData.name || userData.given_name,
        profileImageUrl: userData.picture,
      };
    } catch (error) {
      this.logger.error('Google user info error:', error);
      throw new ServiceUnavailableException('Google user info service unavailable');
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
    try {
      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams([
          ['client_id', this.clientId || ''],
          ['client_secret', this.clientSecret || ''],
          ['refresh_token', refreshToken],
          ['grant_type', 'refresh_token'],
        ]),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Google token refresh failed: ${error}`);
        throw new BadRequestException('Google token refresh failed');
      }

      const tokens = await response.json() as OAuthTokenResponse;
      this.logger.log('Google token refresh successful');
      return tokens;
    } catch (error) {
      this.logger.error('Google token refresh error:', error);
      throw new ServiceUnavailableException('Google OAuth service unavailable');
    }
  }

  async revokeToken(token: string): Promise<void> {
    try {
      const response = await fetch(`${this.revokeUrl}?token=${token}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Google token revoke failed: ${error}`);
        throw new BadRequestException('Google token revoke failed');
      }

      this.logger.log('Google token revoked successfully');
    } catch (error) {
      this.logger.error('Google token revoke error:', error);
      throw new ServiceUnavailableException('Google OAuth service unavailable');
    }
  }
}