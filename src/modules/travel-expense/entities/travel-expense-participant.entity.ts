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
@Unique(['expenseId', 'memberId'])
@Index(['expenseId'])
@Index(['memberId'])
export class TravelExpenseParticipant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'expense_id' })
  expenseId!: string;

  @Column({ type: 'uuid', name: 'member_id' })
  memberId!: string;

  // Relations
  @ManyToOne(() => TravelExpense, (expense) => expense.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'expense_id' })
  expense!: TravelExpense;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'member_id' })
  member!: User;

  constructor(partial: Partial<TravelExpenseParticipant> = {}) {
    Object.assign(this, partial);
  }
}