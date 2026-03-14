import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { TravelMember } from './travel-member.entity';

@Entity('travels')
export class Travel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'date', name: 'start_date' })
  startDate!: Date;

  @Column({ type: 'date', name: 'end_date' })
  endDate!: Date;

  @Column({ length: 2, name: 'country_code' })
  countryCode!: string;

  @Column({ length: 3, name: 'base_currency' })
  baseCurrency!: string;

  @Column({ type: 'numeric', name: 'base_exchange_rate' })
  baseExchangeRate!: number;

  @Column({ type: 'text', nullable: true, name: 'invite_code' })
  inviteCode?: string;

  @Column({ type: 'text', default: 'draft' })
  status!: string;

  @Column({ type: 'uuid', name: 'owner_id' })
  ownerId!: string;

  @Column({ type: 'varchar', nullable: true, name: 'country_name_kr' })
  countryNameKr?: string;

  @Column({ type: 'text', array: true, name: 'country_currencies', default: '{}' })
  countryCurrencies!: string[];

  @Column({ type: 'bigint', nullable: true })
  budget?: number;

  @Column({ length: 3, nullable: true, name: 'budget_currency' })
  budgetCurrency?: string;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at', default: () => 'now()' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at', default: () => 'now()' })
  updatedAt!: Date;

  @OneToMany(() => TravelMember, (travelMember) => travelMember.travel, {
    cascade: true,
  })
  members!: TravelMember[];
}