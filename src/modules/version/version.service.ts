import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { env } from '../../config/env';
import { getPool } from '../../db/pool';

export interface AppVersionMeta {
  bundleId: string;
  latestVersion: string;
  releaseNotes: string | null;
  trackName: string | null;
  minimumOsVersion: string | null;
  lastUpdated: string | null;
  minSupportedVersion: string | null;
  forceUpdate: boolean;
  currentVersion: string | null;
  shouldUpdate: boolean;
  message: string | null;
  appStoreUrl: string | null;
}

@Injectable()
export class VersionService {
  private readonly logger = new Logger(VersionService.name);
  private readonly networkTimeout = 5000;
  private readonly appVersionCache = new Map<string, { data: AppVersionMeta; expiresAt: number }>();
  private readonly appVersionCacheTTL = 1000 * 60 * 5; // 5분
  private appVersionTableReady = false;

  private async ensureAppVersionTable(): Promise<void> {
    if (this.appVersionTableReady) return;
    const pool = await getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_versions (
        bundle_id TEXT PRIMARY KEY,
        latest_version TEXT NOT NULL,
        min_supported_version TEXT,
        force_update BOOLEAN DEFAULT false,
        release_notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    this.appVersionTableReady = true;
  }

  private async fetchDbVersion(bundleId: string) {
    try {
      await this.ensureAppVersionTable();
      const pool = await getPool();
      const result = await pool.query(
        `SELECT bundle_id,
                latest_version,
                min_supported_version,
                force_update,
                release_notes,
                updated_at
         FROM app_versions
         WHERE bundle_id = $1
         LIMIT 1`,
        [bundleId],
      );
      return result.rows[0] ?? null;
    } catch (error) {
      // DB 문제 시 App Store 결과만으로 동작 (로그는 최소화)
      return null;
    }
  }

  private async fetchWithTimeout(url: string, retries = 2): Promise<Response> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.networkTimeout);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'SseudamBackend/1.0.0',
            'Accept': 'application/json',
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
      } catch (error) {
        if (attempt === retries) {
          throw new ServiceUnavailableException('App Store lookup failed');
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    throw new ServiceUnavailableException('App Store lookup failed');
  }

  private compareVersions(a: string, b: string): number {
    const parse = (v: string) => v.split('.').map((part) => Number(part) || 0);
    const aParts = parse(a);
    const bParts = parse(b);
    const len = Math.max(aParts.length, bParts.length);
    for (let i = 0; i < len; i++) {
      const aVal = aParts[i] ?? 0;
      const bVal = bParts[i] ?? 0;
      if (aVal > bVal) return 1;
      if (aVal < bVal) return -1;
    }
    return 0;
  }

  async getAppVersion(
    bundleId?: string,
    currentVersion?: string,
    forceUpdateOverride?: boolean,
  ): Promise<AppVersionMeta> {
    await this.ensureAppVersionTable();
    // bundleId 고정값으로 설정
    const resolvedBundleId = 'io.sseudam.co';

    const cacheKey = `${resolvedBundleId}|${currentVersion ?? ''}|${forceUpdateOverride ?? 'auto'}`;
    const cached = this.appVersionCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const dbVersion = await this.fetchDbVersion(resolvedBundleId);

    let app: any = null;
    try {
      const url = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(resolvedBundleId)}`;
      const response = await this.fetchWithTimeout(url, 2);
      const payload = (await response.json()) as any;
      app = payload?.results?.[0] ?? null;
    } catch (error) {
      // App Store 조회 실패 시 DB 값이 없으면 오류
      if (!dbVersion) {
        throw new ServiceUnavailableException('App version not found from App Store');
      }
    }

    if (!app && !dbVersion) {
      throw new ServiceUnavailableException('App version not found from App Store');
    }

    const data: AppVersionMeta = {
      bundleId: resolvedBundleId,
      latestVersion: dbVersion?.latest_version ?? app?.version ?? '0.0.0',
      releaseNotes: dbVersion?.release_notes ?? app?.releaseNotes ?? null,
      trackName: app?.trackName ?? null,
      minimumOsVersion: app?.minimumOsVersion ?? null,
      lastUpdated: dbVersion?.updated_at ?? app?.currentVersionReleaseDate ?? null,
      minSupportedVersion: dbVersion?.min_supported_version ?? env.appMinSupportedVersion ?? null,
      forceUpdate: true, // forceUpdate 고정값으로 설정
      currentVersion: currentVersion ?? null,
      shouldUpdate: false,
      message: null,
      appStoreUrl: app?.trackViewUrl ?? null,
    };

    // forceUpdate는 항상 true로 고정
    data.forceUpdate = true;

    if (currentVersion) {
      data.shouldUpdate = this.compareVersions(currentVersion, data.latestVersion) < 0;
    }

    if (data.shouldUpdate || data.forceUpdate) {
      data.message = '최신 버전이 나왔습니다. 앱스토어에서 업데이트 해주세요!';
    }

    // DB에 버전 정보를 캐싱 (성공해도 실패해도 본 응답에는 영향 없음)
    this.upsertDbVersion(data).catch((err) =>
      this.logger.warn(`[version] Failed to upsert app_versions: ${err instanceof Error ? err.message : String(err)}`),
    );

    this.appVersionCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + this.appVersionCacheTTL,
    });

    return data;
  }

  private async upsertDbVersion(data: AppVersionMeta): Promise<void> {
    try {
      await this.ensureAppVersionTable();
      const pool = await getPool();
      await pool.query(
        `INSERT INTO app_versions (bundle_id, latest_version, min_supported_version, force_update, release_notes)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (bundle_id)
         DO UPDATE SET
           latest_version = EXCLUDED.latest_version,
           min_supported_version = EXCLUDED.min_supported_version,
           force_update = EXCLUDED.force_update,
           release_notes = EXCLUDED.release_notes,
           updated_at = NOW()`,
        [
          data.bundleId,
          data.latestVersion,
          data.minSupportedVersion,
          data.forceUpdate,
          data.releaseNotes,
        ],
      );
    } catch (error) {
      throw error;
    }
  }
}
