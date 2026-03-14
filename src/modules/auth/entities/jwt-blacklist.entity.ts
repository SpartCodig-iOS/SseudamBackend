import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type BlacklistReason = 'logout' | 'security' | 'admin' | 'refresh';

@Entity('jwt_blacklist')
@Index(['tokenId'], { unique: true })
@Index(['userId'])
@Index(['expiresAt'])
export class JwtBlacklist {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'token_id', type: 'varchar', length: 255, unique: true })
  tokenId!: string;

  @Column({ name: 'user_id', type: 'varchar', length: 255 })
  userId!: string;

  @Column({
    name: 'reason',
    type: 'enum',
    enum: ['logout', 'security', 'admin', 'refresh'],
    default: 'logout'
  })
  reason!: BlacklistReason;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt!: Date;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress?: string;

  @CreateDateColumn({ name: 'blacklisted_at' })
  blacklistedAt!: Date;
}
