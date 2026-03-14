// Legacy user session entity for backward compatibility

import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity('user_sessions')
@Index(['user_id'])
@Index(['session_id'])
export class UserSession {
  @PrimaryColumn('varchar', { length: 64 })
  session_id!: string;

  @Column('uuid')
  user_id!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  login_type!: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  last_seen_at!: Date;

  @Column({ type: 'timestamp' })
  expires_at!: Date;

  @Column({ type: 'timestamp', nullable: true })
  revoked_at!: Date | null;
}