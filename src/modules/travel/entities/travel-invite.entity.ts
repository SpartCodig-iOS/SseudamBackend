import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Index,
  JoinColumn,
} from 'typeorm';
import { Travel } from './travel.entity';
import { User } from '../../user/entities/user.entity';

export enum TravelInviteStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

@Entity('travel_invites')
@Index(['inviteCode'], { unique: true })
@Index(['travelId'])
@Index(['createdBy'])
@Index(['status'])
@Index(['expiresAt'])
// 복합 인덱스: 여행별 활성 초대 코드 조회 최적화
@Index(['travelId', 'status'])
export class TravelInvite {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'travel_id' })
  travelId!: string;

  @Column({ type: 'text', unique: true, name: 'invite_code' })
  inviteCode!: string;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy!: string | null;

  @Column({ type: 'text', default: TravelInviteStatus.ACTIVE })
  status!: TravelInviteStatus;

  @Column({ type: 'timestamp with time zone', nullable: true, name: 'expires_at' })
  expiresAt!: Date | null;

  @Column({ type: 'integer', nullable: true, name: 'max_uses' })
  maxUses!: number | null;

  @Column({ type: 'integer', default: 0, name: 'used_count' })
  usedCount!: number;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  // Relations
  @ManyToOne(() => Travel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'travel_id' })
  travel!: Travel;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  creator!: User | null;

  constructor(partial: Partial<TravelInvite> = {}) {
    Object.assign(this, partial);
  }
}