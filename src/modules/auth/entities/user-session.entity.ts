import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { LOGIN_TYPE_VALUES, LoginType } from '../types/auth.types';

/**
 * user_sessions 테이블에 매핑되는 UserSession 엔티티.
 * 사용자 인증 세션 정보를 관리합니다.
 *
 * user_id 컬럼에 UNIQUE 제약이 걸려 있어 사용자당 1개 세션만 유지됩니다.
 * (로그인 시 기존 세션을 Upsert 방식으로 갱신)
 */
@Entity('user_sessions')
@Index('idx_user_sessions_session_id', ['session_id'])
@Index('idx_user_sessions_user_id', ['user_id'])
export class UserSession {
  /**
   * UUID 형식의 세션 식별자.
   * randomUUID()로 생성되며 로그인마다 교체됩니다.
   */
  @PrimaryColumn({ type: 'uuid', name: 'session_id' })
  session_id!: string;

  /**
   * 세션 소유 사용자 ID (profiles.id FK).
   * UNIQUE 제약으로 사용자당 1개 세션만 허용됩니다.
   */
  @Column({ type: 'uuid', name: 'user_id', unique: true })
  user_id!: string;

  /**
   * 로그인 방식 (email, apple, google 등).
   */
  @Column({
    type: 'varchar',
    length: 20,
    name: 'login_type',
    enum: LOGIN_TYPE_VALUES,
  })
  login_type!: LoginType;

  /**
   * 세션 마지막 활성 시각 (touchSession 호출 시 갱신).
   */
  @Column({
    type: 'timestamp with time zone',
    name: 'last_seen_at',
    default: () => 'NOW()',
  })
  last_seen_at!: Date;

  /**
   * 세션 만료 시각. 기본 30일(720시간).
   */
  @Column({
    type: 'timestamp with time zone',
    name: 'expires_at',
  })
  expires_at!: Date;

  /**
   * 세션 폐기 시각. NULL이면 아직 유효한 세션입니다.
   */
  @Column({
    type: 'timestamp with time zone',
    name: 'revoked_at',
    nullable: true,
  })
  revoked_at!: Date | null;

  @CreateDateColumn({
    type: 'timestamp with time zone',
    name: 'created_at',
  })
  created_at!: Date;

  // 순환 참조 방지를 위해 ForwardRef 문자열 사용
  @ManyToOne('User', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: any;

  constructor(partial: Partial<UserSession> = {}) {
    Object.assign(this, partial);
  }
}
