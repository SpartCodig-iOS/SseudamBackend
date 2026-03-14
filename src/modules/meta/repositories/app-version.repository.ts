import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppVersion } from '../entities/app-version.entity';

@Injectable()
export class AppVersionRepository {
  constructor(
    @InjectRepository(AppVersion)
    private readonly appVersionRepository: Repository<AppVersion>,
  ) {}

  async findByBundleId(bundleId: string): Promise<AppVersion | null> {
    return this.appVersionRepository.findOne({
      where: { bundleId },
    });
  }

  async upsertVersion(data: {
    bundleId: string;
    latestVersion: string;
    minSupportedVersion?: string | null;
    forceUpdate?: boolean;
    releaseNotes?: string | null;
  }): Promise<AppVersion> {
    const existing = await this.findByBundleId(data.bundleId);

    if (existing) {
      // Update existing record
      await this.appVersionRepository.update(
        { bundleId: data.bundleId },
        {
          latestVersion: data.latestVersion,
          minSupportedVersion: data.minSupportedVersion,
          forceUpdate: data.forceUpdate ?? false,
          releaseNotes: data.releaseNotes,
          updatedAt: new Date(),
        },
      );

      return this.findByBundleId(data.bundleId) as Promise<AppVersion>;
    } else {
      // Create new record
      const newVersion = this.appVersionRepository.create({
        bundleId: data.bundleId,
        latestVersion: data.latestVersion,
        minSupportedVersion: data.minSupportedVersion,
        forceUpdate: data.forceUpdate ?? false,
        releaseNotes: data.releaseNotes,
      });

      return this.appVersionRepository.save(newVersion);
    }
  }

  async findAll(): Promise<AppVersion[]> {
    return this.appVersionRepository.find({
      order: { updatedAt: 'DESC' },
    });
  }

  async deleteByBundleId(bundleId: string): Promise<void> {
    await this.appVersionRepository.delete({ bundleId });
  }

  /**
   * Legacy method for emergency version override
   */
  async setEmergencyVersion(bundleId: string): Promise<void> {
    const latestVersion = '999.999.999';
    const minSupported = '17.0';
    const forceUpdate = true;
    const releaseNotes = `긴급 업데이트: ${bundleId} 앱에 중요한 보안 업데이트가 있습니다. 즉시 업데이트해 주세요.`;

    await this.upsertVersion({
      bundleId,
      latestVersion,
      minSupportedVersion: minSupported,
      forceUpdate,
      releaseNotes,
    });
  }
}