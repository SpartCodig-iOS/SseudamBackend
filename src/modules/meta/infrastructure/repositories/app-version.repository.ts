import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppVersion } from '../modules/meta/entities/app-version.entity';

@Injectable()
export class AppVersionRepository {
  constructor(
    @InjectRepository(AppVersion)
    private readonly repository: Repository<AppVersion>,
  ) {}

  async findByBundleId(bundleId: string): Promise<AppVersion | null> {
    return this.repository.findOne({ where: { bundleId } });
  }

  async upsert(data: {
    bundleId: string;
    latestVersion: string;
    minSupportedVersion?: string | null;
    forceUpdate?: boolean;
    releaseNotes?: string | null;
    updatedAt?: Date;
  }): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .insert()
      .into(AppVersion)
      .values({
        bundleId: data.bundleId,
        latestVersion: data.latestVersion,
        minSupportedVersion: data.minSupportedVersion ?? null,
        forceUpdate: data.forceUpdate ?? false,
        releaseNotes: data.releaseNotes ?? null,
        updatedAt: data.updatedAt ?? new Date(),
      })
      .orUpdate(
        ['latest_version', 'min_supported_version', 'force_update', 'release_notes', 'updated_at'],
        ['bundle_id'],
      )
      .execute();
  }

  async ensureTableExists(): Promise<void> {
    // TypeORM이 엔티티 기반으로 테이블을 관리하므로 별도 DDL 불필요.
    // synchronize: true 또는 마이그레이션으로 처리됩니다.
  }

  getRepository(): Repository<AppVersion> {
    return this.repository;
  }
}
