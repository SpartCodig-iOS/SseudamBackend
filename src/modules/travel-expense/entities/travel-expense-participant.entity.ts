import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  JoinColumn,
  Unique,
} from 'typeorm';
import { TravelExpense } from './travel-expense.entity';
import { User } from '../../user/entities/user.entity';

@Entity('travel_expense_participants')
@Unique(['expenseId', 'memberId']) // 주의: memberId가 nullable이므로 성능 영향 있음
@Index(['expenseId'])
@Index(['memberId']) // nullable 컬럼 인덱스 - 필요시 partial index 고려
export class TravelExpenseParticipant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'expense_id' })
  expenseId!: string;

  @Column({ type: 'uuid', name: 'member_id', nullable: true })
  memberId!: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, name: 'split_amount' })
  splitAmount!: number;

  @Column({ type: 'text', nullable: true, name: 'display_name' })
  displayName!: string | null;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  // Relations
  @ManyToOne(() => TravelExpense, (expense) => expense.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'expense_id' })
  expense!: TravelExpense;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'member_id' })
  member!: User | null;

  constructor(partial: Partial<TravelExpenseParticipant> = {}) {
    Object.assign(this, partial);
  }
}