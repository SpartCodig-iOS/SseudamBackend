import { Injectable, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { BaseOAuthService, OAuthUserInfo, OAuthTokenResponse, OAuthTokenOptions } from './base-oauth.service';
import { env } from '../../../config/env';

@Injectable()
export class KakaoOAuthService extends BaseOAuthService {
  private readonly clientId = env.kakaoClientId;
  private readonly clientSecret = env.kakaoClientSecret;
  private readonly baseUrl = 'https://kauth.kakao.com/oauth/authorize';
  private readonly tokenUrl = 'https://kauth.kakao.com/oauth/token';
  private readonly userInfoUrl = 'https://kapi.kakao.com/v2/user/me';
  private readonly unlinkUrl = 'https://kapi.kakao.com/v1/user/unlink';

  getAuthUrl(options?: { redirectUri?: string; state?: string; scope?: string }): string {
    const params = new URLSearchParams();
    params.append('client_id', this.clientId || '');
    params.append('redirect_uri', options?.redirectUri || `${env.appBaseUrl}/auth/kakao/callback`);
    params.append('response_type', 'code');
    params.append('scope', options?.scope || 'profile_nickname profile_image account_email');
    params.append('state', options?.state || this.generateState());

    return `${this.baseUrl}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string, options?: OAuthTokenOptions): Promise<OAuthTokenResponse> {
    try {
      const body = new URLSearchParams([
        ['grant_type', 'authorization_code'],
        ['client_id', this.clientId || ''],
        ['redirect_uri', options?.redirectUri || `${env.appBaseUrl}/auth/kakao/callback`],
        ['code', code],
      ]);

      // client_secret이 있으면 추가
      if (this.clientSecret) {
        body.append('client_secret', this.clientSecret);
      }

      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Kakao token exchange failed: ${error}`);
        throw new BadRequestException('Kakao token exchange failed');
      }

      const tokens = await response.json() as OAuthTokenResponse;
      this.logger.log('Kakao token exchange successful');
      return tokens;
    } catch (error) {
      this.logger.error('Kakao token exchange error:', error);
      throw new ServiceUnavailableException('Kakao OAuth service unavailable');
    }
  }

  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    try {
      const response = await fetch(this.userInfoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Kakao user info fetch failed: ${error}`);
        throw new BadRequestException('Failed to get Kakao user info');
      }

      const userData = await response.json() as any;

      return {
        id: userData.id?.toString(),
        email: userData.kakao_account?.email,
        nickname: userData.kakao_account?.profile?.nickname || userData.properties?.nickname,
        profileImageUrl: userData.kakao_account?.profile?.profile_image_url || userData.properties?.profile_image,
      };
    } catch (error) {
      this.logger.error('Kakao user info error:', error);
      throw new ServiceUnavailableException('Kakao user info service unavailable');
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
    try {
      const body = new URLSearchParams([
        ['grant_type', 'refresh_token'],
        ['client_id', this.clientId || ''],
        ['refresh_token', refreshToken],
      ]);

      // client_secret이 있으면 추가
      if (this.clientSecret) {
        body.append('client_secret', this.clientSecret);
      }

      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Kakao token refresh failed: ${error}`);
        throw new BadRequestException('Kakao token refresh failed');
      }

      const tokens = await response.json() as OAuthTokenResponse;
      this.logger.log('Kakao token refresh successful');
      return tokens;
    } catch (error) {
      this.logger.error('Kakao token refresh error:', error);
      throw new ServiceUnavailableException('Kakao OAuth service unavailable');
    }
  }

  async revokeToken(accessToken: string): Promise<void> {
    try {
      const response = await fetch(this.unlinkUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Kakao token revoke failed: ${error}`);
        throw new BadRequestException('Kakao token revoke failed');
      }

      this.logger.log('Kakao account unlinked successfully');
    } catch (error) {
      this.logger.error('Kakao token revoke error:', error);
      throw new ServiceUnavailableException('Kakao OAuth service unavailable');
    }
  }

  async unlinkAccount(accessToken: string): Promise<void> {
    await this.revokeToken(accessToken);
  }
}