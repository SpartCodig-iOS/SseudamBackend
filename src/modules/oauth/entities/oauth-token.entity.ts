import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * oauth_refresh_tokens 테이블에 매핑되는 OAuthToken 엔티티.
 *
 * DB 스키마: (user_id, provider) 복합 PK, id 컬럼 없음.
 * - (user_id, provider) 쌍에 UNIQUE 제약이 있습니다.
 * - saveToken() 호출 시 refreshToken이 NULL이면 해당 행을 삭제합니다.
 */
@Entity('oauth_refresh_tokens')
@Index('idx_oauth_tokens_user_id', ['user_id'])
export class OAuthToken {
  // DB 스키마: (user_id, provider) 복합 기본키
  @PrimaryColumn({ type: 'uuid', name: 'user_id' })
  user_id!: string;

  @PrimaryColumn({ type: 'text', name: 'provider' })
  provider!: string;

  /**
   * 암호화된 OAuth refresh token 값 (nullable).
   */
  @Column({ type: 'text', nullable: true, name: 'refresh_token' })
  refresh_token!: string | null;

  @UpdateDateColumn({
    type: 'timestamp with time zone',
    name: 'updated_at',
    nullable: true,
  })
  updated_at!: Date;

  // id 프로퍼티: BaseRepository 호환성을 위한 가상 게터
  get id(): string {
    return `${this.user_id}:${this.provider}`;
  }

  constructor(partial: Partial<OAuthToken> = {}) {
    Object.assign(this, partial);
  }
}
