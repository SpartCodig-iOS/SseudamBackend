import { Injectable } from '@nestjs/common';
import { OAuthTokenRepository } from '../repositories/oauth-token.repository';

@Injectable()
export class OAuthTokenService {
  constructor(private readonly oauthTokenRepository: OAuthTokenRepository) {}

  async saveToken(userId: string, provider: string, refreshToken: string | null): Promise<void> {
    await this.oauthTokenRepository.saveToken(userId, provider, refreshToken);
  }

  async getToken(userId: string, provider: string): Promise<string | null> {
    return this.oauthTokenRepository.getToken(userId, provider);
  }

  async deleteToken(userId: string, provider: string): Promise<void> {
    await this.oauthTokenRepository.deleteToken(userId, provider);
  }

  async deleteAllUserTokens(userId: string): Promise<void> {
    await this.oauthTokenRepository.deleteAllUserTokens(userId);
  }
}
