import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

/**
 * device_tokens 테이블에 매핑되는 DeviceToken 엔티티.
 *
 * - device_token 컬럼에 UNIQUE 제약이 있어 동일 토큰은 하나만 존재합니다.
 * - user_id가 NULL이면 비로그인(anonymous) 상태의 토큰입니다.
 * - pending_key는 익명 토큰을 사용자와 연결하기 위한 임시 키입니다.
 * - 사용자당 최신 토큰만 is_active=true를 유지합니다.
 */
@Entity('device_tokens')
@Index('idx_device_tokens_user_id', ['user_id'])
@Index('idx_device_tokens_pending_key', ['pending_key'])
@Index('idx_device_tokens_device_token', ['device_token'], { unique: true })
@Index('idx_device_tokens_user_active', ['user_id', 'is_active'])
export class DeviceToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * 연결된 사용자 ID. NULL이면 익명(anonymous) 토큰입니다.
   */
  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  user_id!: string | null;

  /**
   * 비로그인 상태에서 토큰을 사용자와 매칭하기 위한 임시 키.
   * 로그인 완료 후 NULL로 초기화됩니다.
   */
  @Column({ type: 'varchar', length: 255, name: 'pending_key', nullable: true })
  pending_key!: string | null;

  /**
   * APNS 디바이스 토큰 (UNIQUE).
   */
  @Column({ type: 'varchar', length: 255, name: 'device_token', unique: true })
  device_token!: string;

  /**
   * 플랫폼 구분. 현재는 'ios' 고정.
   */
  @Column({ type: 'varchar', length: 20, name: 'platform', default: 'ios' })
  platform!: string;

  /**
   * 활성 여부. 사용자당 가장 최근 토큰만 true.
   */
  @Column({ type: 'boolean', name: 'is_active', default: true })
  is_active!: boolean;

  /**
   * 마지막 사용 시각 (Upsert 시 갱신).
   */
  @Column({
    type: 'timestamp with time zone',
    name: 'last_used_at',
    default: () => 'NOW()',
  })
  last_used_at!: Date;

  @CreateDateColumn({
    type: 'timestamp with time zone',
    name: 'created_at',
  })
  created_at!: Date;

  @UpdateDateColumn({
    type: 'timestamp with time zone',
    name: 'updated_at',
  })
  updated_at!: Date;

  // 순환 참조 방지를 위해 ForwardRef 사용
  @ManyToOne('User', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user!: import('../../user/entities/user.entity').User | null;

  constructor(partial: Partial<DeviceToken> = {}) {
    Object.assign(this, partial);
  }
}
