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
import { User } from './user.entity';
import { Travel } from './travel.entity';
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
@Index(['travel_id'])
@Index(['author_id'])
@Index(['payer_id'])
@Index(['expense_date'])
@Index(['category'])
export class TravelExpense {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'travel_id' })
  travelId!: string;

  @Column({ type: 'varchar', length: 50 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount!: number;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, name: 'converted_amount' })
  convertedAmount!: number;

  @Column({ type: 'date', name: 'expense_date' })
  expenseDate!: string;

  @Column({
    type: 'enum',
    enum: ExpenseCategory,
    nullable: true,
  })
  category!: ExpenseCategory | null;

  @Column({ type: 'uuid', name: 'author_id' })
  authorId!: string;

  @Column({ type: 'uuid', nullable: true, name: 'payer_id' })
  payerId!: string | null;

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