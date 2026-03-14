import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Index,
  JoinColumn,
  Unique,
} from 'typeorm';
import { TravelExpense } from './travel-expense.entity';
import { User } from '../../../user/entities/user.entity';

@Entity('travel_expense_participants')
@Unique(['expense_id', 'user_id'])
@Index(['expense_id'])
@Index(['user_id'])
export class TravelExpenseParticipant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'expense_id' })
  expenseId!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  // Relations
  @ManyToOne(() => TravelExpense, (expense) => expense.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'expense_id' })
  expense!: TravelExpense;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  constructor(partial: Partial<TravelExpenseParticipant> = {}) {
    Object.assign(this, partial);
  }
}