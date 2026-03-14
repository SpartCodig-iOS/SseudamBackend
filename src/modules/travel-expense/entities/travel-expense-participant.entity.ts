import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TravelExpense } from './travel-expense.entity';
import { User } from '../../user/entities/user.entity';

@Entity('travel_expense_participants')
export class TravelExpenseParticipant {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'uuid' })
  expenseId!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'bigint' })
  shareAmount!: number;

  @Column({ length: 3 })
  currency!: string;

  @Column({ default: false })
  isPaid!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => TravelExpense, (expense) => expense.participants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'expenseId' })
  expense!: TravelExpense;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;
}