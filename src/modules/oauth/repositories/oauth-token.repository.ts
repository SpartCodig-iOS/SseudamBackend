import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OAuthToken } from '../entities/oauth-token.entity';

@Injectable()
export class OAuthTokenRepository {
  constructor(
    @InjectRepository(OAuthToken)
    private readonly oauthTokenRepository: Repository<OAuthToken>,
  ) {}

  async saveToken(userId: string, provider: string, refreshToken: string | null): Promise<void> {
    if (!refreshToken) {
      // Delete token if refresh token is null
      await this.oauthTokenRepository.delete({ userId, provider });
      return;
    }

    // Upsert token using TypeORM
    await this.oauthTokenRepository.save({
      userId,
      provider,
      refreshToken,
    });
  }

  async getToken(userId: string, provider: string): Promise<string | null> {
    const tokenEntity = await this.oauthTokenRepository.findOne({
      where: { userId, provider },
      select: ['refreshToken'],
    });

    return tokenEntity?.refreshToken ?? null;
  }

  async deleteToken(userId: string, provider: string): Promise<void> {
    await this.oauthTokenRepository.delete({ userId, provider });
  }

  async deleteAllUserTokens(userId: string): Promise<void> {
    await this.oauthTokenRepository.delete({ userId });
  }

  async findTokensByProvider(provider: string): Promise<OAuthToken[]> {
    return this.oauthTokenRepository.find({
      where: { provider },
      select: ['userId', 'provider', 'refreshToken', 'updatedAt'],
    });
  }
}