import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Travel } from '../../travel/entities/travel.entity';
import { TravelExpenseParticipant } from './travel-expense-participant.entity';

@Entity('travel_expenses')
export class TravelExpense {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  travelId!: string;

  @Column({ type: 'int' })
  payerId!: number;

  @Column({ length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'bigint' })
  amount!: number;

  @Column({ length: 3 })
  currency!: string;

  @Column({ type: 'date' })
  expenseDate!: Date;

  @Column({ length: 100, nullable: true })
  category?: string;

  @Column({ type: 'text', nullable: true })
  receiptUrl?: string;

  @Column({ default: false })
  isSettled!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => Travel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'travelId' })
  travel!: Travel;

  @OneToMany(
    () => TravelExpenseParticipant,
    (participant) => participant.expense,
    { cascade: true }
  )
  participants!: TravelExpenseParticipant[];
}