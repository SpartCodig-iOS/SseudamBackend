import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Travel } from './travel.entity';
import { User } from '../../user/entities/user.entity';

export enum TravelMemberRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
}

@Entity('travel_members')
export class TravelMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'travel_id' })
  travelId!: string;

  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId!: string;

  @Column({ type: 'text' })
  role!: string;

  @Column({ type: 'text', nullable: true, name: 'display_name' })
  displayName?: string;

  @Column({ type: 'timestamp with time zone', name: 'joined_at', default: () => 'now()' })
  joinedAt!: Date;

  @ManyToOne(() => Travel, (travel) => travel.members, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'travel_id' })
  travel!: Travel;

  @ManyToOne(() => User, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}