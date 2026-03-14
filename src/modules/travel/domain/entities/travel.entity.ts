import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  Index,
  JoinColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { TravelExpense } from '../../travel-expense/entities/travel-expense.entity';
import { TravelMember } from './travel-member.entity';

export enum TravelStatus {
  PLANNING = 'planning',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('travels')
@Index(['owner_id'])
@Index(['invite_code'], { unique: true })
@Index(['status'])
@Index(['start_date', 'end_date'])
export class Travel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  title!: string;

  @Column({ type: 'date', name: 'start_date' })
  startDate!: string;

  @Column({ type: 'date', name: 'end_date' })
  endDate!: string;

  @Column({ type: 'char', length: 2, name: 'country_code' })
  countryCode!: string;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'country_name_kr' })
  countryNameKr!: string | null;

  @Column({ type: 'char', length: 3, name: 'base_currency' })
  baseCurrency!: string;

  @Column({ type: 'decimal', precision: 15, scale: 6, name: 'base_exchange_rate' })
  baseExchangeRate!: number;

  @Column({ type: 'simple-array', name: 'country_currencies' })
  countryCurrencies!: string[];

  @Column({ type: 'bigint', nullable: true })
  budget!: number | null;

  @Column({ type: 'char', length: 3, nullable: true, name: 'budget_currency' })
  budgetCurrency!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true, unique: true, name: 'invite_code' })
  inviteCode!: string | null;

  @Column({
    type: 'enum',
    enum: TravelStatus,
    default: TravelStatus.PLANNING,
  })
  status!: TravelStatus;

  @Column({ type: 'uuid', name: 'owner_id' })
  ownerId!: string;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;

  // Relations
  @ManyToOne(() => User, (user) => user.travels, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  user!: User;

  @OneToMany(() => TravelExpense, (expense) => expense.travel, { cascade: true })
  expenses!: TravelExpense[];

  @OneToMany(() => TravelMember, (member) => member.travel, { cascade: true })
  members!: TravelMember[];

  constructor(partial: Partial<Travel> = {}) {
    Object.assign(this, partial);
  }
}