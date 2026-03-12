import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
  JoinColumn,
} from 'typeorm';
import { Travel } from '../../travel/entities/travel.entity';
import { User } from '../../user/entities/user.entity';

export enum SettlementStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
}

@Entity('travel_settlements')
@Index(['travelId'])
@Index(['fromMember'])
@Index(['toMember'])
@Index(['status'])
// 복합 인덱스: 여행별 상태 필터링 (정산 목록 조회 핵심 패턴)
@Index(['travelId', 'status'])
// 복합 인덱스: 특정 멤버가 보내야 하는 정산 조회
@Index(['travelId', 'fromMember'])
// 복합 인덱스: 특정 멤버가 받아야 하는 정산 조회
@Index(['travelId', 'toMember'])
export class TravelSettlement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'travel_id' })
  travelId!: string;

  @Column({ type: 'uuid', name: 'from_member' })
  fromMember!: string;

  @Column({ type: 'uuid', name: 'to_member' })
  toMember!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount!: number;

  @Column({
    type: 'text',
    default: SettlementStatus.PENDING,
  })
  status!: SettlementStatus;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true, name: 'completed_at' })
  completedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;

  // Relations
  @ManyToOne(() => Travel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'travel_id' })
  travel!: Travel;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'from_member' })
  fromUser!: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'to_member' })
  toUser!: User;

  constructor(partial: Partial<TravelSettlement> = {}) {
    Object.assign(this, partial);
  }
}
