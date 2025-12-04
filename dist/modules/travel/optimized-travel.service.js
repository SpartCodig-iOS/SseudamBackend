"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var OptimizedTravelService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptimizedTravelService = void 0;
const common_1 = require("@nestjs/common");
const pool_1 = require("../../db/pool");
const cacheService_1 = require("../../services/cacheService");
const meta_service_1 = require("../meta/meta.service");
let OptimizedTravelService = OptimizedTravelService_1 = class OptimizedTravelService {
    constructor(cacheService, metaService) {
        this.cacheService = cacheService;
        this.metaService = metaService;
        this.logger = new common_1.Logger(OptimizedTravelService_1.name);
        this.CACHE_TTL = 120; // 2분 캐시 (빠른 응답 최적화)
        this.TRAVEL_LIST_CACHE_PREFIX = 'user_travels';
        this.TRAVEL_DETAIL_CACHE_PREFIX = 'travel_detail';
        this.countryCurrencyCache = new Map();
        this.countryCurrencyLoaded = false;
        this.countryCurrencyLoadPromise = null;
        this.CACHE_TTL_SECONDS = 10; // Redis 캐시 TTL
        this.transformTravelRow = (row) => {
            const destinationCurrency = this.resolveDestinationCurrency(row.country_code, row.base_currency);
            const result = {
                id: row.id,
                title: row.title,
                startDate: row.start_date,
                endDate: row.end_date,
                countryCode: row.country_code,
                countryNameKr: row.country_name_kr ?? undefined,
                baseCurrency: row.base_currency,
                baseExchangeRate: parseFloat(row.base_exchange_rate),
                destinationCurrency,
                inviteCode: row.invite_code,
                status: row.status,
                role: row.role,
                createdAt: row.created_at,
                ownerName: row.owner_name,
            };
            // 멤버 정보가 있으면 members 배열로, 없으면 memberCount로
            if (row.members) {
                const members = typeof row.members === 'string' ? JSON.parse(row.members) : row.members;
                result.members = members || [];
            }
            else if (row.member_count !== undefined) {
                result.memberCount = row.member_count;
            }
            return result;
        };
    }
    // 캐시 키 생성
    getTravelListCacheKey(userId, page, limit, status) {
        return `${this.TRAVEL_LIST_CACHE_PREFIX}:${userId}:${page}:${limit}:${status ?? 'all'}`;
    }
    getTravelDetailCacheKey(travelId) {
        return `${this.TRAVEL_DETAIL_CACHE_PREFIX}:${travelId}`;
    }
    // 최적화된 여행 목록 조회 (멤버 정보 없이 빠른 조회)
    async listTravelsOptimized(userId, pagination = {}, includeMembers = false) {
        const page = Math.max(1, pagination.page ?? 1);
        const limit = Math.min(100, Math.max(1, pagination.limit ?? 20));
        const offset = (page - 1) * limit;
        const status = pagination.status === 'active' || pagination.status === 'archived' ? pagination.status : undefined;
        const sort = 'start_date'; // 파라미터 없이 시작일 오름차순 고정
        // 국가-통화 매핑 확인 (백그라운드로 실행)
        this.ensureCountryCurrencyLoaded().catch(error => this.logger.warn(`Failed to load country currency mapping: ${error.message}`));
        const startTime = process.hrtime.bigint();
        const cacheKey = this.getTravelListCacheKey(userId, page, limit, status);
        // Redis 캐시 조회 (짧은 TTL)
        try {
            const cached = await this.cacheService.get(cacheKey);
            if (cached) {
                this.logger.debug(`Travel list cache hit (redis) for user ${userId}`);
                return cached;
            }
        }
        catch (error) {
            this.logger.warn(`Travel list cache read failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        try {
            const pool = await (0, pool_1.getPool)();
            // 병렬로 총 개수와 목록 조회
            const [totalResult, listResult] = await Promise.all([
                this.getTotalTravelsCount(pool, userId, status),
                this.getTravelsList(pool, userId, limit, offset, includeMembers, status, sort),
            ]);
            const total = totalResult.rows[0]?.total ?? 0;
            const items = listResult.rows.map(this.transformTravelRow);
            const result = {
                total,
                page,
                limit,
                items,
            };
            // Redis 캐시에 짧게 저장 (비동기)
            this.cacheService.set(cacheKey, result, { ttl: this.CACHE_TTL_SECONDS }).catch(error => this.logger.warn(`Failed to cache travel list: ${error.message}`));
            const endTime = process.hrtime.bigint();
            const durationMs = Number(endTime - startTime) / 1000000;
            if (durationMs > 200) {
                this.logger.warn(`Slow travel list query: ${durationMs.toFixed(2)}ms for user ${userId}`);
            }
            return result;
        }
        catch (error) {
            const endTime = process.hrtime.bigint();
            const durationMs = Number(endTime - startTime) / 1000000;
            this.logger.error(`Travel list query failed after ${durationMs.toFixed(2)}ms: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }
    async getTotalTravelsCount(pool, userId, status) {
        const statusCondition = this.buildStatusCondition(status, 't');
        return pool.query(`SELECT COUNT(*)::int AS total
       FROM travel_members tm
       INNER JOIN travels t ON t.id = tm.travel_id
       WHERE tm.user_id = $1
       ${statusCondition}`, [userId]);
    }
    async getTravelsList(pool, userId, limit, offset, includeMembers, status, sort) {
        const statusCondition = this.buildStatusCondition(status, 't');
        const orderClause = this.buildOrderClause(sort);
        if (includeMembers) {
            // 멤버 정보 포함 (최적화된 쿼리)
            return pool.query(`SELECT
           t.id::text AS id,
           t.title,
           t.start_date::text AS start_date,
           t.end_date::text AS end_date,
           t.country_code,
           t.country_name_kr,
           t.base_currency,
           t.base_exchange_rate,
           ti.invite_code,
           CASE WHEN t.end_date < CURRENT_DATE THEN 'archived' ELSE 'active' END AS status,
           tm.role,
           t.created_at::text,
           owner_profile.name AS owner_name,
           COALESCE(members.members, '[]'::json) AS members
         FROM travels t
         INNER JOIN travel_members tm ON tm.travel_id = t.id AND tm.user_id = $1
         INNER JOIN profiles owner_profile ON owner_profile.id = t.owner_id
         LEFT JOIN travel_invites ti ON ti.travel_id = t.id AND ti.status = 'active'
           LEFT JOIN LATERAL (
             SELECT json_agg(
                      json_build_object(
                        'userId', tm2.user_id,
                        'name', p.name,
                        'role', tm2.role
                    )
                    ORDER BY tm2.joined_at
                  ) AS members
           FROM travel_members tm2
           LEFT JOIN profiles p ON p.id = tm2.user_id
           WHERE tm2.travel_id = t.id
         ) AS members ON TRUE
         WHERE 1 = 1
         ${statusCondition}
         ${orderClause}
         LIMIT $2 OFFSET $3`, [userId, limit, offset]);
        }
        else {
            // 멤버 정보 없이 빠른 조회 (성능 최적화: DB에서 status 계산)
            return pool.query(`SELECT
           t.id::text AS id,
           t.title,
           t.start_date::text AS start_date,
           t.end_date::text AS end_date,
           t.country_code,
           t.country_name_kr,
           t.base_currency,
           t.base_exchange_rate,
           ti.invite_code,
           CASE WHEN t.end_date < CURRENT_DATE THEN 'archived' ELSE 'active' END AS status,
           tm.role,
           t.created_at::text,
           owner_profile.name AS owner_name,
           member_counts.member_count
         FROM travels t
           INNER JOIN travel_members tm ON tm.travel_id = t.id AND tm.user_id = $1
           INNER JOIN profiles owner_profile ON owner_profile.id = t.owner_id
             LEFT JOIN travel_invites ti ON ti.travel_id = t.id AND ti.status = 'active'
             LEFT JOIN (
               SELECT travel_id, COUNT(*)::int AS member_count
               FROM travel_members
               GROUP BY travel_id
             ) AS member_counts ON member_counts.travel_id = t.id
           WHERE 1 = 1
           ${statusCondition}
           ${orderClause}
           LIMIT $2 OFFSET $3`, [userId, limit, offset]);
        }
    }
    buildOrderClause(sort) {
        switch (sort) {
            case 'start_date':
                return 'ORDER BY t.start_date ASC, t.created_at DESC';
            case 'start_date_desc':
                return 'ORDER BY t.start_date DESC, t.created_at DESC';
            default:
                return 'ORDER BY t.created_at DESC';
        }
    }
    buildStatusCondition(status, alias) {
        if (status === 'active') {
            return `AND ${alias}.end_date >= CURRENT_DATE`;
        }
        if (status === 'archived') {
            return `AND ${alias}.end_date < CURRENT_DATE`;
        }
        return '';
    }
    // 여행 상세 정보 캐시드 조회
    async getTravelDetailCached(travelId, userId) {
        const cacheKey = this.getTravelDetailCacheKey(travelId);
        // Redis 캐시 조회 (짧은 TTL)
        try {
            const cached = await this.cacheService.get(cacheKey);
            if (cached) {
                this.logger.debug(`Travel detail cache hit (redis) for travel ${travelId}`);
                return cached;
            }
        }
        catch (error) {
            this.logger.warn(`Travel detail cache read failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        const pool = await (0, pool_1.getPool)();
        const result = await pool.query(`SELECT
         t.id::text AS id,
         t.title,
         t.start_date::text,
         t.end_date::text,
         t.country_code,
         t.country_name_kr,
         t.base_currency,
         t.base_exchange_rate,
         t.invite_code,
         t.status,
         t.created_at::text,
         tm.role,
         owner_profile.name AS owner_name,
         COALESCE(members.members, '[]'::json) AS members
       FROM travels t
       INNER JOIN travel_members tm ON tm.travel_id = t.id AND tm.user_id = $2
       INNER JOIN profiles owner_profile ON owner_profile.id = t.owner_id
       LEFT JOIN LATERAL (
         SELECT json_agg(
                  json_build_object(
                    'userId', tm2.user_id,
                    'name', p.name,
                    'role', tm2.role
                  )
                  ORDER BY tm2.joined_at
                ) AS members
         FROM travel_members tm2
         LEFT JOIN profiles p ON p.id = tm2.user_id
         WHERE tm2.travel_id = t.id
       ) AS members ON TRUE
       WHERE t.id = $1`, [travelId, userId]);
        if (result.rows.length === 0) {
            return null;
        }
        const travel = this.transformTravelRow(result.rows[0]);
        // Redis 캐시에 짧게 저장 (비동기)
        this.cacheService.set(cacheKey, travel, { ttl: this.CACHE_TTL_SECONDS }).catch(error => this.logger.warn(`Failed to cache travel detail: ${error.message}`));
        return travel;
    }
    // 캐시 무효화 메서드들
    async invalidateTravelListCache(userId) {
        try {
            await this.cacheService.delPattern(`${this.TRAVEL_LIST_CACHE_PREFIX}:${userId}:*`);
            this.logger.debug(`Invalidated travel list cache for user ${userId}`);
        }
        catch (error) {
            this.logger.warn(`Failed to invalidate travel list cache: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async invalidateTravelDetailCache(travelId) {
        try {
            const cacheKey = this.getTravelDetailCacheKey(travelId);
            await this.cacheService.del(cacheKey);
            this.logger.debug(`Invalidated travel detail cache for travel ${travelId}`);
        }
        catch (error) {
            this.logger.warn(`Failed to invalidate travel detail cache: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    // 여행 멤버들의 캐시 무효화
    async invalidateMemberTravelCaches(memberIds) {
        const promises = memberIds.map(memberId => this.invalidateTravelListCache(memberId));
        await Promise.allSettled(promises);
    }
    // 배치 여행 정보 조회 (최적화)
    async getTravelsBatch(travelIds) {
        if (travelIds.length === 0) {
            return new Map();
        }
        const uniqueIds = Array.from(new Set(travelIds));
        const cachedTravels = new Map();
        const uncachedIds = [];
        // 캐시에서 먼저 조회
        for (const id of uniqueIds) {
            const cacheKey = this.getTravelDetailCacheKey(id);
            const cached = await this.cacheService.get(cacheKey);
            if (cached) {
                cachedTravels.set(id, cached);
            }
            else {
                uncachedIds.push(id);
            }
        }
        // 캐시되지 않은 여행들을 배치로 조회
        if (uncachedIds.length > 0) {
            const pool = await (0, pool_1.getPool)();
            const placeholders = uncachedIds.map((_, i) => `$${i + 1}`).join(',');
            const result = await pool.query(`SELECT
           t.id::text AS id,
           t.title,
           t.start_date::text,
           t.end_date::text,
           t.country_code,
           t.country_name_kr,
           t.base_currency,
           t.base_exchange_rate,
           t.invite_code,
           t.status,
           t.created_at::text,
           owner_profile.name AS owner_name
         FROM travels t
         INNER JOIN profiles owner_profile ON owner_profile.id = t.owner_id
         WHERE t.id IN (${placeholders})`, uncachedIds);
            // 조회 결과를 캐시에 저장
            for (const row of result.rows) {
                const travel = this.transformTravelRow(row);
                cachedTravels.set(row.id, travel);
                // 비동기로 캐시 저장
                const cacheKey = this.getTravelDetailCacheKey(row.id);
                this.cacheService.set(cacheKey, travel, { ttl: this.CACHE_TTL }).catch(error => this.logger.warn(`Failed to cache travel ${row.id}: ${error.message}`));
            }
        }
        return cachedTravels;
    }
    // 국가-통화 매핑 캐시 로딩
    async ensureCountryCurrencyLoaded() {
        if (this.countryCurrencyLoaded) {
            return;
        }
        if (this.countryCurrencyLoadPromise) {
            return this.countryCurrencyLoadPromise;
        }
        this.countryCurrencyLoadPromise = this.loadCountryCurrencyMapping();
        await this.countryCurrencyLoadPromise;
        this.countryCurrencyLoaded = true;
        this.countryCurrencyLoadPromise = null;
    }
    async loadCountryCurrencyMapping() {
        try {
            const countries = await this.metaService.getCountries();
            for (const country of countries) {
                const code = (country.code ?? '').toUpperCase();
                const currency = country.currencies?.[0];
                if (code && currency) {
                    this.countryCurrencyCache.set(code, currency.toUpperCase());
                }
            }
            this.logger.debug(`Loaded ${this.countryCurrencyCache.size} country-currency mappings`);
        }
        catch (error) {
            this.logger.error('Failed to load country-currency mapping:', error);
        }
    }
    resolveDestinationCurrency(countryCode, baseCurrency) {
        const code = (countryCode ?? '').toUpperCase();
        return this.countryCurrencyCache.get(code) ?? (baseCurrency ?? 'USD');
    }
};
exports.OptimizedTravelService = OptimizedTravelService;
exports.OptimizedTravelService = OptimizedTravelService = OptimizedTravelService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [cacheService_1.CacheService,
        meta_service_1.MetaService])
], OptimizedTravelService);
