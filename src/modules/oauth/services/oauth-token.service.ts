import { Injectable } from '@nestjs/common';
import { OAuthTokenRepository } from '../repositories/oauth-token.repository';

@Injectable()
export class OAuthTokenService {
  constructor(private readonly oauthTokenRepository: OAuthTokenRepository) {}

  /**
   * OAuth refresh token을 저장하거나 갱신합니다.
   * refreshToken이 null인 경우 해당 행을 삭제합니다.
   *
   * @param userId - 사용자 ID
   * @param provider - OAuth 제공자 ('apple', 'google', 'kakao')
   * @param refreshToken - refresh token 값. null이면 삭제 처리
   */
  async saveToken(
    userId: string,
    provider: string,
    refreshToken: string | null,
  ): Promise<void> {
    if (!refreshToken) {
      await this.oauthTokenRepository.deleteToken(userId, provider);
      return;
    }

    await this.oauthTokenRepository.upsertToken(userId, provider, refreshToken);
  }

  /**
   * 특정 사용자·제공자의 refresh token을 조회합니다.
   * 토큰이 없으면 null을 반환합니다.
   */
  async getToken(userId: string, provider: string): Promise<string | null> {
    return this.oauthTokenRepository.findToken(userId, provider);
  }
}
