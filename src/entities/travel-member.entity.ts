import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
  JoinColumn,
  Unique,
} from 'typeorm';
import { User } from './user.entity';
import { Travel } from './travel.entity';

export enum TravelMemberRole {
  OWNER = 'owner',
  EDITOR = 'editor',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

@Entity('travel_members')
@Unique(['travel_id', 'user_id'])
@Index(['travel_id'])
@Index(['user_id'])
@Index(['role'])
export class TravelMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'travel_id' })
  travelId!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({
    type: 'enum',
    enum: TravelMemberRole,
    default: TravelMemberRole.MEMBER,
  })
  role!: TravelMemberRole;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'joined_at' })
  joinedAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;

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