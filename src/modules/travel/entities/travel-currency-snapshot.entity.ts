import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Index,
  JoinColumn,
} from 'typeorm';
import { Travel } from './travel.entity';

@Entity('travel_currency_snapshots')
@Index(['travelId'])
@Index(['baseCurrency'])
@Index(['destinationCurrency'])
@Index(['createdAt'])
// 복합 인덱스: 여행별 통화 스냅샷 조회 최적화
@Index(['travelId', 'baseCurrency', 'destinationCurrency'])
export class TravelCurrencySnapshot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'travel_id' })
  travelId!: string;

  @Column({ type: 'varchar', name: 'base_currency' })
  baseCurrency!: string;

  @Column({ type: 'varchar', name: 'destination_currency' })
  destinationCurrency!: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, name: 'base_amount' })
  baseAmount!: number;

  @Column({ type: 'decimal', precision: 15, scale: 6, name: 'base_exchange_rate' })
  baseExchangeRate!: number;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  // Relations
  @ManyToOne(() => Travel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'travel_id' })
  travel!: Travel;

  constructor(partial: Partial<TravelCurrencySnapshot> = {}) {
    Object.assign(this, partial);
  }
}