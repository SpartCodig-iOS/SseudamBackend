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

  @Column({ type: 'int' })
  userId!: number;

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
}