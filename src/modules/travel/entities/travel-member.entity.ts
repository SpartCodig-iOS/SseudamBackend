import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Index,
  JoinColumn,
  Unique,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Travel } from './travel.entity';

export enum TravelMemberRole {
  OWNER = 'owner',
  EDITOR = 'editor',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

@Entity('travel_members')
@Unique(['travelId', 'userId'])
@Index(['travelId'])
@Index(['userId'])
@Index(['role'])
// 복합 인덱스: 여행별 역할 필터링 (권한 체크 핵심 패턴)
@Index(['travelId', 'role'])
// 복합 인덱스: 사용자가 참여한 여행 목록 조회 최적화
@Index(['userId', 'joinedAt'])
export class TravelMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'travel_id' })
  travelId!: string;

  @Column({ type: 'uuid', nullable: true, name: 'user_id' })
  userId!: string | null;

  // DB 스키마: text 타입 (enum 아님)
  @Column({ type: 'text', default: TravelMemberRole.MEMBER })
  role!: TravelMemberRole;

  @Column({ type: 'text', nullable: true, name: 'display_name' })
  displayName!: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'joined_at' })
  joinedAt!: Date;

  // Relations
  @ManyToOne(() => Travel, (travel) => travel.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'travel_id' })
  travel!: Travel;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  constructor(partial: Partial<TravelMember> = {}) {
    Object.assign(this, partial);
  }
}