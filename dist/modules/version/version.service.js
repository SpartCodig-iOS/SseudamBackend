"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var VersionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.VersionService = void 0;
const common_1 = require("@nestjs/common");
const env_1 = require("../../config/env");
const pool_1 = require("../../db/pool");
let VersionService = VersionService_1 = class VersionService {
    constructor() {
        this.logger = new common_1.Logger(VersionService_1.name);
        this.networkTimeout = 5000;
        this.appVersionCache = new Map();
        this.appVersionCacheTTL = 1000 * 60 * 5; // 5분
        this.appVersionTableReady = false;
    }
    async ensureAppVersionTable() {
        if (this.appVersionTableReady)
            return;
        const pool = await (0, pool_1.getPool)();
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
    async fetchDbVersion(bundleId) {
        try {
            await this.ensureAppVersionTable();
            const pool = await (0, pool_1.getPool)();
            const result = await pool.query(`SELECT bundle_id,
                latest_version,
                min_supported_version,
                force_update,
                release_notes,
                updated_at
         FROM app_versions
         WHERE bundle_id = $1
         LIMIT 1`, [bundleId]);
            return result.rows[0] ?? null;
        }
        catch (error) {
            // DB 문제 시 App Store 결과만으로 동작 (로그는 최소화)
            return null;
        }
    }
    async fetchWithTimeout(url, retries = 2) {
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
            }
            catch (error) {
                if (attempt === retries) {
                    throw new common_1.ServiceUnavailableException('App Store lookup failed');
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
        }
        throw new common_1.ServiceUnavailableException('App Store lookup failed');
    }
    compareVersions(a, b) {
        const parse = (v) => v.split('.').map((part) => Number(part) || 0);
        const aParts = parse(a);
        const bParts = parse(b);
        const len = Math.max(aParts.length, bParts.length);
        for (let i = 0; i < len; i++) {
            const aVal = aParts[i] ?? 0;
            const bVal = bParts[i] ?? 0;
            if (aVal > bVal)
                return 1;
            if (aVal < bVal)
                return -1;
        }
        return 0;
    }
    async getAppVersion(bundleId, currentVersion, forceUpdateOverride) {
        await this.ensureAppVersionTable();
        const resolvedBundleId = (bundleId ?? env_1.env.appleClientId ?? '').trim();
        if (!resolvedBundleId) {
            throw new common_1.ServiceUnavailableException('bundleId (APPLE_CLIENT_ID) is not configured');
        }
        const cacheKey = `${resolvedBundleId}|${currentVersion ?? ''}|${forceUpdateOverride ?? 'auto'}`;
        const cached = this.appVersionCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.data;
        }
        const dbVersion = await this.fetchDbVersion(resolvedBundleId);
        let app = null;
        try {
            const url = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(resolvedBundleId)}`;
            const response = await this.fetchWithTimeout(url, 2);
            const payload = (await response.json());
            app = payload?.results?.[0] ?? null;
        }
        catch (error) {
            // App Store 조회 실패 시 DB 값이 없으면 오류
            if (!dbVersion) {
                throw new common_1.ServiceUnavailableException('App version not found from App Store');
            }
        }
        if (!app && !dbVersion) {
            throw new common_1.ServiceUnavailableException('App version not found from App Store');
        }
        const data = {
            bundleId: resolvedBundleId,
            latestVersion: dbVersion?.latest_version ?? app?.version ?? '0.0.0',
            releaseNotes: dbVersion?.release_notes ?? app?.releaseNotes ?? null,
            trackName: app?.trackName ?? null,
            minimumOsVersion: app?.minimumOsVersion ?? null,
            lastUpdated: dbVersion?.updated_at ?? app?.currentVersionReleaseDate ?? null,
            minSupportedVersion: dbVersion?.min_supported_version ?? env_1.env.appMinSupportedVersion ?? null,
            forceUpdate: Boolean(env_1.env.appForceUpdate),
            currentVersion: currentVersion ?? null,
            shouldUpdate: false,
            message: null,
            appStoreUrl: app?.trackViewUrl ?? null,
        };
        const baseForceUpdate = typeof forceUpdateOverride === 'boolean'
            ? forceUpdateOverride
            : dbVersion?.force_update ?? Boolean(env_1.env.appForceUpdate);
        let requiresMin = false;
        if (currentVersion) {
            data.shouldUpdate = this.compareVersions(currentVersion, data.latestVersion) < 0;
            requiresMin = data.minSupportedVersion
                ? this.compareVersions(currentVersion, data.minSupportedVersion) < 0
                : false;
        }
        data.forceUpdate = baseForceUpdate || requiresMin;
        if (data.shouldUpdate || data.forceUpdate) {
            data.message = '최신 버전이 나왔습니다. 앱스토어에서 업데이트 해주세요!';
        }
        // DB에 버전 정보를 캐싱 (성공해도 실패해도 본 응답에는 영향 없음)
        this.upsertDbVersion(data).catch((err) => this.logger.warn(`[version] Failed to upsert app_versions: ${err instanceof Error ? err.message : String(err)}`));
        this.appVersionCache.set(cacheKey, {
            data,
            expiresAt: Date.now() + this.appVersionCacheTTL,
        });
        return data;
    }
    async upsertDbVersion(data) {
        try {
            await this.ensureAppVersionTable();
            const pool = await (0, pool_1.getPool)();
            await pool.query(`INSERT INTO app_versions (bundle_id, latest_version, min_supported_version, force_update, release_notes)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (bundle_id)
         DO UPDATE SET
           latest_version = EXCLUDED.latest_version,
           min_supported_version = EXCLUDED.min_supported_version,
           force_update = EXCLUDED.force_update,
           release_notes = EXCLUDED.release_notes,
           updated_at = NOW()`, [
                data.bundleId,
                data.latestVersion,
                data.minSupportedVersion,
                data.forceUpdate,
                data.releaseNotes,
            ]);
        }
        catch (error) {
            throw error;
        }
    }
};
exports.VersionService = VersionService;
exports.VersionService = VersionService = VersionService_1 = __decorate([
    (0, common_1.Injectable)()
], VersionService);
