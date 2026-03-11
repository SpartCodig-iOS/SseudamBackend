import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OAuthToken } from '../entities/oauth-token.entity';
import { BaseRepository } from '../../../common/repositories/base.repository';

@Injectable()
export class OAuthTokenRepository extends BaseRepository<OAuthToken> {
  constructor(
    @InjectRepository(OAuthToken)
    oauthTokenRepository: Repository<OAuthToken>,
  ) {
    super(oauthTokenRepository);
  }

  /**
   * OAuth refresh token을 저장하거나 갱신합니다.
   * (user_id, provider) UNIQUE 제약 기준으로 충돌 시 refresh_token과 updated_at을 갱신합니다.
   */
  async upsertToken(
    userId: string,
    provider: string,
    refreshToken: string,
  ): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .insert()
      .into(OAuthToken)
      .values({
        user_id: userId,
        provider,
        refresh_token: refreshToken,
      })
      .orUpdate(['refresh_token', 'updated_at'], ['user_id', 'provider'])
      .execute();
  }

  /**
   * 특정 사용자·제공자의 refresh token을 조회합니다.
   * 행이 없으면 null을 반환합니다.
   */
  async findToken(userId: string, provider: string): Promise<string | null> {
    const row = await this.repository.findOne({
      where: { user_id: userId, provider },
      select: ['refresh_token'],
    });

    return row?.refresh_token ?? null;
  }

  /**
   * 특정 사용자·제공자의 토큰을 삭제합니다.
   * refreshToken이 null인 경우(saveToken 호환)에 대응합니다.
   */
  async deleteToken(userId: string, provider: string): Promise<void> {
    await this.repository.delete({ user_id: userId, provider });
  }

  /**
   * 특정 사용자의 모든 OAuth 토큰을 삭제합니다.
   * 계정 탈퇴 처리 시 사용합니다.
   */
  async deleteAllByUserId(userId: string): Promise<void> {
    await this.repository.delete({ user_id: userId });
  }
}
