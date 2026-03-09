import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('app_versions')
export class AppVersion {
  @PrimaryColumn({ type: 'text', name: 'bundle_id' })
  bundleId!: string;

  @Column({ type: 'text', name: 'latest_version' })
  latestVersion!: string;

  @Column({ type: 'text', nullable: true, name: 'min_supported_version' })
  minSupportedVersion!: string | null;

  @Column({ type: 'boolean', default: false, name: 'force_update' })
  forceUpdate!: boolean;

  @Column({ type: 'text', nullable: true, name: 'release_notes' })
  releaseNotes!: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', name: 'updated_at' })
  updatedAt!: Date;

  constructor(partial: Partial<AppVersion> = {}) {
    Object.assign(this, partial);
  }
}
