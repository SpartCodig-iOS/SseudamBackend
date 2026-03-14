import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { TravelMember } from './travel-member.entity';

@Entity('travels')
export class Travel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'date' })
  startDate!: Date;

  @Column({ type: 'date' })
  endDate!: Date;

  @Column({ length: 3 })
  baseCurrency!: string;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  baseExchangeRate!: number;

  @Column({ length: 3, nullable: true })
  countryCode?: string;

  @Column({ length: 3, nullable: true })
  destinationCurrency?: string;

  @Column({ type: 'bigint', nullable: true })
  budget?: number;

  @Column({ length: 3, nullable: true })
  budgetCurrency?: string;

  @Column({ length: 50, unique: true })
  inviteCode!: string;

  @Column({ length: 50, default: 'active' })
  status!: string;

  @Column({ type: 'int' })
  ownerId!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => TravelMember, (travelMember) => travelMember.travel, {
    cascade: true,
  })
  members!: TravelMember[];
}