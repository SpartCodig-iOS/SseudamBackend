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
import { Travel } from './travel.entity';

@Entity('currency_rates')
@Unique(['travelId', 'currencyCode', 'isInitial'])
@Index(['travelId'])
@Index(['currencyCode'])
@Index(['effectiveAt'])
export class CurrencyRate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'travel_id' })
  travelId!: string;

  @Column({ type: 'varchar', length: 3, name: 'currency_code' })
  currencyCode!: string;

  @Column({ type: 'decimal', precision: 15, scale: 6 })
  rate!: number;

  @Column({ type: 'boolean', default: false, name: 'is_initial' })
  isInitial!: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'effective_at' })
  effectiveAt!: Date;

  // Relations
  @ManyToOne(() => Travel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'travel_id' })
  travel!: Travel;

  constructor(partial: Partial<CurrencyRate> = {}) {
    Object.assign(this, partial);
  }
}