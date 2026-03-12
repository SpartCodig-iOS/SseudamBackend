import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('app_version_history')
@Index(['bundleId', 'recordedAt'])
export class AppVersionHistory {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string; // bigint는 Node.js에서 string으로 반환됨

  @Column({ type: 'text', name: 'bundle_id' })
  bundleId!: string;

  @Column({ type: 'text' })
  version!: string;

  @Column({ type: 'text', nullable: true, name: 'release_notes' })
  releaseNotes!: string | null;

  @Column({ type: 'boolean', default: false, name: 'force_update' })
  forceUpdate!: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'recorded_at' })
  recordedAt!: Date;

  constructor(partial: Partial<AppVersionHistory> = {}) {
    Object.assign(this, partial);
  }
}