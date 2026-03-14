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
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'uuid' })
  travelId!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({
    type: 'enum',
    enum: TravelMemberRole,
    default: TravelMemberRole.MEMBER,
  })
  role!: TravelMemberRole;

  @Column({ length: 255, nullable: true })
  nickname?: string;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => Travel, (travel) => travel.members, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'travelId' })
  travel!: Travel;

  @ManyToOne(() => User, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user!: User;
}