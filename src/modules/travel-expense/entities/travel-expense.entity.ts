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

  @Column({ type: 'uuid' })
  payerId!: string;

  @Column({ length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'text', nullable: true })
  note?: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount!: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  convertedAmount?: number;

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

  @Column({ type: 'uuid', nullable: true })
  authorId?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  payerName?: string;

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