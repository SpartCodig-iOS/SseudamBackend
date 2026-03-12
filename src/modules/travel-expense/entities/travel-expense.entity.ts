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
import { Travel } from '../../travel/entities/travel.entity';
import { TravelExpenseParticipant } from './travel-expense-participant.entity';

export enum ExpenseCategory {
  ACCOMMODATION = 'accommodation',
  FOOD_AND_DRINK = 'food_and_drink',
  TRANSPORTATION = 'transportation',
  ACTIVITY = 'activity',
  SHOPPING = 'shopping',
  OTHER = 'other',
}

@Entity('travel_expenses')
@Index(['travelId'])
@Index(['authorId'])
@Index(['payerId'])
@Index(['expenseDate'])
@Index(['category'])
// 복합 인덱스: 여행별 날짜 범위 조회 (가장 빈번한 지출 목록 패턴)
@Index(['travelId', 'expenseDate'])
// 복합 인덱스: 여행별 결제자 필터링
@Index(['travelId', 'payerId'])
// 복합 인덱스: 여행별 카테고리 집계 쿼리 최적화
@Index(['travelId', 'category'])
// 복합 인덱스: 정렬 커버링 인덱스 (travelId + createdAt DESC 정렬)
@Index(['travelId', 'createdAt'])
export class TravelExpense {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'travel_id' })
  travelId!: string;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount!: number;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, name: 'converted_amount' })
  convertedAmount!: number;

  @Column({ type: 'date', name: 'expense_date' })
  expenseDate!: string;

  @Column({ type: 'text', nullable: true })
  category!: ExpenseCategory | null;

  @Column({ type: 'uuid', name: 'author_id' })
  authorId!: string;

  @Column({ type: 'uuid', nullable: true, name: 'payer_id' })
  payerId!: string | null;

  @Column({ type: 'text', nullable: true, name: 'display_name' })
  displayName!: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;

  // Relations
  @ManyToOne(() => Travel, (travel) => travel.expenses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'travel_id' })
  travel!: Travel;

  @ManyToOne(() => User, (user) => user.expenses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  user!: User;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'payer_id' })
  payer!: User | null;

  @OneToMany(() => TravelExpenseParticipant, (participant) => participant.expense, { cascade: true })
  participants!: TravelExpenseParticipant[];

  constructor(partial: Partial<TravelExpense> = {}) {
    Object.assign(this, partial);
  }
}