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
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

@Entity('travels')
@Index(['ownerId'])
@Index(['inviteCode'], { unique: true })
@Index(['status'])
@Index(['startDate', 'endDate'])
// 복합 인덱스: 사용자별 상태 필터링 (여행 목록 조회 핵심 패턴)
@Index(['ownerId', 'status'])
// 복합 인덱스: 날짜 범위 + 상태 조합 조회 최적화
@Index(['status', 'startDate'])
// 복합 인덱스: 생성일 내림차순 정렬이 기본이므로 커버링 인덱스 역할
@Index(['ownerId', 'createdAt'])
export class Travel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // DB 스키마: text 타입
  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'date', name: 'start_date' })
  startDate!: string;

  @Column({ type: 'date', name: 'end_date' })
  endDate!: string;

  // DB 스키마: character varying(2)
  @Column({ type: 'varchar', length: 2, name: 'country_code' })
  countryCode!: string;

  @Column({ type: 'varchar', nullable: true, name: 'country_name_kr' })
  countryNameKr!: string | null;

  // DB 스키마: character varying(3)
  @Column({ type: 'varchar', length: 3, name: 'base_currency' })
  baseCurrency!: string;

  @Column({ type: 'decimal', precision: 15, scale: 6, name: 'base_exchange_rate' })
  baseExchangeRate!: number;

  // DB 스키마: ARRAY 타입 (PostgreSQL native array)
  @Column({ type: 'text', array: true, name: 'country_currencies' })
  countryCurrencies!: string[];

  @Column({ type: 'bigint', nullable: true })
  budget!: number | null;

  @Column({ type: 'varchar', length: 3, nullable: true, name: 'budget_currency' })
  budgetCurrency!: string | null;

  // DB 스키마: text 타입
  @Column({ type: 'text', nullable: true, unique: true, name: 'invite_code' })
  inviteCode!: string | null;

  // DB 스키마: text 타입 (enum 아님)
  @Column({ type: 'text', default: TravelStatus.DRAFT })
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
  owner!: User;

  @OneToMany(() => TravelExpense, (expense) => expense.travel, { cascade: true })
  expenses!: TravelExpense[];

  @OneToMany(() => TravelMember, (member) => member.travel, { cascade: true })
  members!: TravelMember[];

  constructor(partial: Partial<Travel> = {}) {
    Object.assign(this, partial);
  }
}