// Legacy device token entity for backward compatibility

import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('device_tokens')
@Index(['user_id'])
@Index(['device_token'])
export class DeviceToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  user_id!: string;

  @Column({ type: 'varchar', length: 255 })
  device_token!: string;

  @Column({ type: 'varchar', length: 20, default: 'ios' })
  platform!: string;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at!: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updated_at!: Date;
}