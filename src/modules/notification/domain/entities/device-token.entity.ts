import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('device_tokens')
@Index('IDX_device_tokens_user_id', ['userId'])
@Index('IDX_device_tokens_device_token', ['deviceToken'], { unique: true })
@Index('IDX_device_tokens_platform', ['platform'])
@Index('IDX_device_tokens_active', ['isActive'])
@Index('IDX_device_tokens_pending_key', ['pendingKey'])
export class DeviceTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'varchar', length: 255, nullable: true })
  userId!: string | null;

  @Column({ name: 'pending_key', type: 'varchar', length: 255, nullable: true })
  pendingKey?: string | null;

  @Column({ name: 'device_token', type: 'text' })
  deviceToken!: string;

  @Column({ type: 'varchar', length: 20 })
  platform!: string;

  @Column({ name: 'device_id', type: 'varchar', length: 255, nullable: true })
  deviceId?: string;

  @Column({ name: 'app_version', type: 'varchar', length: 50, nullable: true })
  appVersion?: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'last_used_at', type: 'timestamp', nullable: true })
  lastUsedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}