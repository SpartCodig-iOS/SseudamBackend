import { Injectable, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { BaseOAuthService, OAuthUserInfo, OAuthTokenResponse, OAuthTokenOptions } from './base-oauth.service';
import { env } from '../../../config/env';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AppleOAuthService extends BaseOAuthService {
  private readonly clientId = env.appleClientId;
  private readonly teamId = env.appleTeamId;
  private readonly keyId = env.appleKeyId;
  private readonly privateKey = env.applePrivateKey;
  private readonly baseUrl = 'https://appleid.apple.com/auth/oauth2/v2/auth';
  private readonly tokenUrl = 'https://appleid.apple.com/auth/oauth2/v2/token';
  private readonly revokeUrl = 'https://appleid.apple.com/auth/oauth2/v2/revoke';

  // Apple JWT 토큰 캐싱 (10분 TTL)
  private appleClientSecretCache: { token: string; expiresAt: number } | null = null;

  getAuthUrl(options?: { redirectUri?: string; state?: string; scope?: string }): string {
    const params = new URLSearchParams();
    params.append('client_id', this.clientId || '');
    params.append('redirect_uri', options?.redirectUri || `${env.appBaseUrl}/auth/apple/callback`);
    params.append('response_type', 'code');
    params.append('scope', options?.scope || 'email name');
    params.append('state', options?.state || this.generateState());
    params.append('response_mode', 'form_post');

    return `${this.baseUrl}?${params.toString()}`;
  }

  private generateAppleClientSecret(): string {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 10 * 60; // 10분

    // 캐시된 토큰이 있고 아직 유효하면 재사용
    if (this.appleClientSecretCache && this.appleClientSecretCache.expiresAt > now + 60) {
      return this.appleClientSecretCache.token;
    }

    const payload = {
      iss: this.teamId,
      iat: now,
      exp: expiresAt,
      aud: 'https://appleid.apple.com',
      sub: this.clientId,
    };

    const options: jwt.SignOptions = {
      algorithm: 'ES256',
      keyid: this.keyId!,
    };
    const token = jwt.sign(payload, this.privateKey!, options);

    // 캐시에 저장
    this.appleClientSecretCache = {
      token,
      expiresAt,
    };

    return token;
  }

  async exchangeCodeForTokens(code: string, options?: OAuthTokenOptions): Promise<OAuthTokenResponse> {
    try {
      const clientSecret = this.generateAppleClientSecret();

      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams([
          ['client_id', this.clientId || ''],
          ['client_secret', clientSecret],
          ['code', code],
          ['grant_type', 'authorization_code'],
          ['redirect_uri', options?.redirectUri || `${env.appBaseUrl}/auth/apple/callback`],
        ]),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Apple token exchange failed: ${error}`);
        throw new BadRequestException('Apple token exchange failed');
      }

      const tokens = await response.json() as OAuthTokenResponse;
      this.logger.log('Apple token exchange successful');
      return tokens;
    } catch (error) {
      this.logger.error('Apple token exchange error:', error);
      throw new ServiceUnavailableException('Apple OAuth service unavailable');
    }
  }

  async getUserInfo(idToken: string): Promise<OAuthUserInfo> {
    try {
      // Apple은 access token으로 사용자 정보를 가져올 수 없고, ID token을 디코드해야 함
      const decoded = jwt.decode(idToken) as any;

      if (!decoded) {
        throw new BadRequestException('Invalid Apple ID token');
      }

      return {
        id: decoded.sub,
        email: decoded.email,
        nickname: decoded.name || decoded.given_name,
        profileImageUrl: undefined, // Apple doesn't provide profile pictures
      };
    } catch (error) {
      this.logger.error('Apple user info error:', error);
      throw new BadRequestException('Failed to decode Apple ID token');
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
    try {
      const clientSecret = this.generateAppleClientSecret();

      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams([
          ['client_id', this.clientId || ''],
          ['client_secret', clientSecret],
          ['refresh_token', refreshToken],
          ['grant_type', 'refresh_token'],
        ]),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Apple token refresh failed: ${error}`);
        throw new BadRequestException('Apple token refresh failed');
      }

      const tokens = await response.json() as OAuthTokenResponse;
      this.logger.log('Apple token refresh successful');
      return tokens;
    } catch (error) {
      this.logger.error('Apple token refresh error:', error);
      throw new ServiceUnavailableException('Apple OAuth service unavailable');
    }
  }

  async revokeToken(token: string, authorizationCode?: string): Promise<void> {
    try {
      const clientSecret = this.generateAppleClientSecret();

      const response = await fetch(this.revokeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams([
          ['client_id', this.clientId || ''],
          ['client_secret', clientSecret],
          ['token', token],
          ['token_type_hint', authorizationCode ? 'authorization_code' : 'refresh_token'],
        ]),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Apple token revoke failed: ${error}`);
        throw new BadRequestException('Apple token revoke failed');
      }

      this.logger.log('Apple token revoked successfully');
    } catch (error) {
      this.logger.error('Apple token revoke error:', error);
      throw new ServiceUnavailableException('Apple OAuth service unavailable');
    }
  }

  async revokeAllTokens(authorizationCode: string): Promise<void> {
    await this.revokeToken(authorizationCode, authorizationCode);
  }
}