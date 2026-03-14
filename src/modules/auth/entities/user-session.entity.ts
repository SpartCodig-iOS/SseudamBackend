import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('user_sessions')
@Index(['user_id'])
@Index(['session_token'], { unique: true })
@Index(['session_id'], { unique: true })
export class UserSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({ type: 'text', name: 'session_id' })
  session_id!: string;

  @Column({ type: 'text' })
  session_token!: string;

  @Column({ type: 'text', nullable: true })
  refresh_token!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'login_type' })
  login_type!: string | null;

  @Column({ type: 'timestamp with time zone' })
  expires_at!: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  device_id!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  platform!: string | null;

  @Column({ type: 'text', nullable: true })
  user_agent!: string | null;

  @Column({ type: 'inet', nullable: true })
  ip_address!: string | null;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @Column({ type: 'timestamp with time zone', nullable: true, name: 'last_seen_at' })
  last_seen_at!: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true, name: 'revoked_at' })
  revoked_at!: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updated_at!: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  constructor(partial: Partial<UserSession> = {}) {
    Object.assign(this, partial);
  }
}
