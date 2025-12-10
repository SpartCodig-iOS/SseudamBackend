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
var TravelService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TravelService = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const crypto_1 = require("crypto");
const pool_1 = require("../../db/pool");
const meta_service_1 = require("../meta/meta.service");
const cacheService_1 = require("../../services/cacheService");
const push_notification_service_1 = require("../../services/push-notification.service");
const env_1 = require("../../config/env");
let TravelService = TravelService_1 = class TravelService {
    constructor(metaService, cacheService = new cacheService_1.CacheService(), eventEmitter, pushNotificationService) {
        this.metaService = metaService;
        this.cacheService = cacheService;
        this.eventEmitter = eventEmitter;
        this.pushNotificationService = pushNotificationService;
        this.logger = new common_1.Logger(TravelService_1.name);
        this.countryCurrencyCache = new Map();
        this.countryCurrencyLoaded = false;
        this.countryCurrencyLoadPromise = null;
        // 여행 목록 캐시: 30초 TTL, 사용자별 캐시
        this.travelListCache = new Map();
        this.TRAVEL_LIST_CACHE_TTL = 30 * 1000; // 30초로 단축하여 최신 반영
        this.MAX_CACHE_SIZE = 1000;
        // 여행 상세 캐시: 30초 TTL
        this.travelDetailCache = new Map();
        this.TRAVEL_DETAIL_CACHE_TTL = 30 * 1000; // 30초로 단축하여 최신 반영
        this.TRAVEL_LIST_REDIS_PREFIX = 'travel:list';
        this.TRAVEL_DETAIL_REDIS_PREFIX = 'travel:detail';
        this.INVITE_REDIS_PREFIX = 'invite:code';
        this.INVITE_TTL_SECONDS = 5 * 60;
        this.TRAVEL_MEMBER_CACHE = new Map();
        this.TRAVEL_MEMBER_TTL = 2 * 60 * 1000; // 2분
        this.TRAVEL_MEMBER_REDIS_PREFIX = 'travel:member';
        this.TRAVEL_MEMBER_REDIS_TTL = 2 * 60; // 2분
        this.MEMBER_LIST_REDIS_PREFIX = 'travel:members';
        this.MEMBER_LIST_REDIS_TTL = 30; // 30초
    }
    async getCachedTravelList(key, rawKey = false) {
        const cacheKey = rawKey ? key : `${key}`;
        // Redis 우선
        try {
            const redisData = await this.cacheService.get(cacheKey, {
                prefix: this.TRAVEL_LIST_REDIS_PREFIX,
            });
            if (redisData) {
                this.travelListCache.set(cacheKey, { data: redisData, expiresAt: Date.now() + this.TRAVEL_LIST_CACHE_TTL });
                return redisData;
            }
        }
        catch (error) {
            this.logger.warn(`[Travel] Redis travel list miss for ${cacheKey}:`, error);
        }
        const cached = this.travelListCache.get(cacheKey);
        if (!cached || Date.now() > cached.expiresAt) {
            this.travelListCache.delete(cacheKey);
            return null;
        }
        return cached.data;
    }
    setCachedTravelList(key, travels, rawKey = false) {
        const cacheKey = rawKey ? key : `${key}`;
        if (this.travelListCache.size >= this.MAX_CACHE_SIZE) {
            const oldestKey = this.travelListCache.keys().next().value;
            if (oldestKey)
                this.travelListCache.delete(oldestKey);
        }
        this.travelListCache.set(cacheKey, {
            data: travels,
            expiresAt: Date.now() + this.TRAVEL_LIST_CACHE_TTL
        });
        // Redis에도 캐싱
        this.cacheService.set(cacheKey, travels, {
            prefix: this.TRAVEL_LIST_REDIS_PREFIX,
            ttl: Math.floor(this.TRAVEL_LIST_CACHE_TTL / 1000),
        }).catch(() => undefined);
    }
    async getCachedTravelDetail(travelId) {
        // Redis 우선
        try {
            const redisData = await this.cacheService.get(travelId, {
                prefix: this.TRAVEL_DETAIL_REDIS_PREFIX,
            });
            if (redisData) {
                this.travelDetailCache.set(travelId, { data: redisData, expiresAt: Date.now() + this.TRAVEL_DETAIL_CACHE_TTL });
                return redisData;
            }
        }
        catch (error) {
            this.logger.warn(`[Travel] Redis travel detail miss for ${travelId}:`, error);
        }
        const cached = this.travelDetailCache.get(travelId);
        if (!cached || Date.now() > cached.expiresAt) {
            this.travelDetailCache.delete(travelId);
            return null;
        }
        return cached.data;
    }
    setCachedTravelDetail(travelId, travel) {
        if (this.travelDetailCache.size >= this.MAX_CACHE_SIZE) {
            const oldestKey = this.travelDetailCache.keys().next().value;
            if (oldestKey)
                this.travelDetailCache.delete(oldestKey);
        }
        this.travelDetailCache.set(travelId, {
            data: travel,
            expiresAt: Date.now() + this.TRAVEL_DETAIL_CACHE_TTL
        });
        this.cacheService.set(travelId, travel, {
            prefix: this.TRAVEL_DETAIL_REDIS_PREFIX,
            ttl: Math.floor(this.TRAVEL_DETAIL_CACHE_TTL / 1000),
        }).catch(() => undefined);
        // 멤버십 캐시도 함께 갱신해 상세 조회 시 DB 조회를 줄임
        travel.members?.forEach(member => {
            this.setMemberCache(travelId, member.userId, true);
        });
    }
    invalidateUserTravelCache(userId) {
        // 메모리 캐시에서 해당 사용자의 모든 키 삭제
        const keys = Array.from(this.travelListCache.keys()).filter(key => key.startsWith(`${userId}:`));
        keys.forEach(key => this.travelListCache.delete(key));
        // Redis 캐시에서도 해당 사용자의 모든 여행 목록 삭제
        this.cacheService.delPattern(`${this.TRAVEL_LIST_REDIS_PREFIX}:${userId}:*`).catch(() => undefined);
        // 최적화 서비스 캐시도 함께 제거
        this.cacheService.delPattern(`user_travels:${userId}:*`).catch(() => undefined);
        // travel_detail:* 전체 삭제 대신 사용자 관련 목록 캐시만 제거
    }
    invalidateTravelDetailCache(travelId) {
        this.travelDetailCache.delete(travelId);
        this.cacheService.del(travelId, { prefix: this.TRAVEL_DETAIL_REDIS_PREFIX }).catch(() => undefined);
        // 최적화 서비스의 상세 캐시도 함께 제거
        this.cacheService.del(`travel_detail:${travelId}`).catch(() => undefined);
    }
    async invalidateTravelCachesForMembers(travelId) {
        // 여행 멤버들의 목록 캐시를 무효화해야 하므로 각 멤버별로 처리
        const pool = await (0, pool_1.getPool)();
        const members = await pool.query(`SELECT user_id FROM travel_members WHERE travel_id = $1`, [travelId]);
        // 각 멤버의 여행 목록 캐시 무효화 (Redis 패턴 삭제)
        const memberIds = members.rows.map(row => row.user_id);
        await Promise.all(memberIds.map(userId => Promise.all([
            this.cacheService.delPattern(`${this.TRAVEL_LIST_REDIS_PREFIX}:${userId}:*`).catch(() => undefined),
            this.cacheService.delPattern(`user_travels:${userId}:*`).catch(() => undefined),
        ])));
        // 메모리 캐시도 개별 무효화
        memberIds.forEach(userId => this.invalidateUserTravelCache(userId));
    }
    async getCachedInvite(inviteCode) {
        try {
            return await this.cacheService.get(inviteCode, { prefix: this.INVITE_REDIS_PREFIX });
        }
        catch {
            return null;
        }
    }
    // 요청자 기준으로 멤버 배열을 재정렬 (요청자 우선)
    reorderMembersForUser(travel, userId) {
        if (!travel.members || travel.members.length === 0) {
            return travel;
        }
        const mine = travel.members.filter(m => m.userId === userId);
        const others = travel.members.filter(m => m.userId !== userId);
        return { ...travel, members: [...mine, ...others] };
    }
    async setCachedInvite(inviteCode, payload) {
        this.cacheService.set(inviteCode, payload, { prefix: this.INVITE_REDIS_PREFIX, ttl: this.INVITE_TTL_SECONDS }).catch(() => undefined);
    }
    invalidateInvite(inviteCode) {
        this.cacheService.del(inviteCode, { prefix: this.INVITE_REDIS_PREFIX }).catch(() => undefined);
    }
    getMembershipCacheKey(travelId, userId) {
        return `${travelId}:${userId}`;
    }
    async recordCurrencySnapshot(client, params) {
        await this.ensureCountryCurrencyMap();
        const destinationCurrency = this.resolveDestinationCurrency(params.countryCode, params.baseCurrency);
        const baseAmount = params.baseAmount ?? 1000;
        await client.query(`INSERT INTO travel_currency_snapshots
         (travel_id, base_currency, destination_currency, base_amount, base_exchange_rate)
       VALUES ($1, $2, $3, $4, $5)`, [
            params.travelId,
            params.baseCurrency.toUpperCase(),
            destinationCurrency,
            baseAmount,
            params.baseExchangeRate,
        ]);
    }
    async isMemberCached(travelId, userId) {
        const key = this.getMembershipCacheKey(travelId, userId);
        const cached = this.TRAVEL_MEMBER_CACHE.get(key);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.exists;
        }
        try {
            const redisCached = await this.cacheService.get(key, { prefix: this.TRAVEL_MEMBER_REDIS_PREFIX });
            if (typeof redisCached === 'boolean') {
                this.TRAVEL_MEMBER_CACHE.set(key, { exists: redisCached, expiresAt: Date.now() + this.TRAVEL_MEMBER_TTL });
                return redisCached;
            }
        }
        catch {
            // ignore
        }
        return null;
    }
    setMemberCache(travelId, userId, exists) {
        const key = this.getMembershipCacheKey(travelId, userId);
        this.TRAVEL_MEMBER_CACHE.set(key, { exists, expiresAt: Date.now() + this.TRAVEL_MEMBER_TTL });
        this.cacheService.set(key, exists, {
            prefix: this.TRAVEL_MEMBER_REDIS_PREFIX,
            ttl: this.TRAVEL_MEMBER_REDIS_TTL,
        }).catch(() => undefined);
    }
    async invalidateMemberCache(travelId, userId) {
        const key = this.getMembershipCacheKey(travelId, userId);
        this.TRAVEL_MEMBER_CACHE.delete(key);
        await this.cacheService.del(key, { prefix: this.TRAVEL_MEMBER_REDIS_PREFIX }).catch(() => undefined);
    }
    async invalidateMembersCacheForTravel(travelId) {
        const keys = Array.from(this.TRAVEL_MEMBER_CACHE.keys()).filter(k => k.startsWith(`${travelId}:`));
        keys.forEach(k => this.TRAVEL_MEMBER_CACHE.delete(k));
        await this.cacheService.delPattern(`${this.TRAVEL_MEMBER_REDIS_PREFIX}:${travelId}:*`).catch(() => undefined);
        await this.cacheService.del(travelId, { prefix: this.MEMBER_LIST_REDIS_PREFIX }).catch(() => undefined);
    }
    setMemberListCache(travelId, members) {
        this.cacheService.set(travelId, members, {
            prefix: this.MEMBER_LIST_REDIS_PREFIX,
            ttl: this.MEMBER_LIST_REDIS_TTL,
        }).catch(() => undefined);
    }
    async loadMembersForTravels(travelIds, requesterId) {
        const membersMap = new Map();
        if (travelIds.length === 0) {
            return membersMap;
        }
        let cachedLists = [];
        try {
            cachedLists = await this.cacheService.mget(travelIds, { prefix: this.MEMBER_LIST_REDIS_PREFIX });
        }
        catch {
            // ignore cache errors
        }
        const missingTravelIds = [];
        travelIds.forEach((id, idx) => {
            const cached = cachedLists[idx];
            if (cached && Array.isArray(cached)) {
                membersMap.set(id, cached);
            }
            else {
                missingTravelIds.push(id);
            }
        });
        if (missingTravelIds.length > 0) {
            const pool = await (0, pool_1.getPool)();
            const result = await pool.query(`SELECT
           tm.travel_id::text AS travel_id,
           tm.user_id::text AS user_id,
           tm.role,
           p.name,
           p.email,
           p.avatar_url,
           tm.joined_at
         FROM travel_members tm
         LEFT JOIN profiles p ON p.id = tm.user_id
         WHERE tm.travel_id = ANY($1::uuid[])
         ORDER BY tm.travel_id,
                  CASE WHEN tm.user_id = $2 THEN 0 ELSE 1 END,
                  tm.joined_at`, [missingTravelIds, requesterId]);
            for (const row of result.rows) {
                const list = membersMap.get(row.travel_id) ?? [];
                list.push({
                    userId: row.user_id,
                    name: row.name ?? null,
                    email: row.email ?? null,
                    avatarUrl: row.avatar_url ?? null,
                    role: row.role ?? 'member',
                });
                membersMap.set(row.travel_id, list);
            }
            const toCache = missingTravelIds
                .filter(id => membersMap.has(id))
                .map(id => ({ key: id, value: membersMap.get(id) }));
            if (toCache.length > 0) {
                this.cacheService.mset(toCache, {
                    prefix: this.MEMBER_LIST_REDIS_PREFIX,
                    ttl: this.MEMBER_LIST_REDIS_TTL,
                }).catch(() => undefined);
            }
        }
        return membersMap;
    }
    async ensureOwner(travelId, userId, runner) {
        const executor = runner ?? (await (0, pool_1.getPool)());
        const result = await executor.query(`SELECT owner_id FROM travels WHERE id = $1`, [travelId]);
        const row = result.rows[0];
        if (!row) {
            throw new common_1.NotFoundException('여행을 찾을 수 없습니다.');
        }
        if (row.owner_id !== userId) {
            throw new common_1.ForbiddenException('여행 호스트만 수행할 수 있는 작업입니다.');
        }
    }
    async isMember(travelId, userId, runner) {
        const cached = await this.isMemberCached(travelId, userId);
        if (cached !== null)
            return cached;
        const executor = runner ?? (await (0, pool_1.getPool)());
        const result = await executor.query(`SELECT 1 FROM travel_members WHERE travel_id = $1 AND user_id = $2 LIMIT 1`, [travelId, userId]);
        const exists = Boolean(result.rows[0]);
        this.setMemberCache(travelId, userId, exists);
        return exists;
    }
    async fetchSummaryForMember(travelId, userId, includeMembers = true) {
        await this.ensureCountryCurrencyMap();
        const pool = await (0, pool_1.getPool)();
        const result = await pool.query(`SELECT
          t.id::text AS id,
          t.title,
          to_char(t.start_date::date, 'YYYY-MM-DD') AS start_date,
          to_char(t.end_date::date, 'YYYY-MM-DD') AS end_date,
          t.country_code,
          t.country_name_kr,
          t.country_currencies,
          t.base_currency,
          t.base_exchange_rate,
         ti.invite_code,
         CASE WHEN t.end_date < CURRENT_DATE THEN 'archived' ELSE 'active' END AS status,
         t.created_at::text,
         tm.role AS role,
         owner_profile.name AS owner_name
       FROM travels t
       INNER JOIN travel_members tm ON tm.travel_id = t.id AND tm.user_id = $2
       LEFT JOIN profiles owner_profile ON owner_profile.id = t.owner_id
       LEFT JOIN travel_invites ti ON ti.travel_id = t.id AND ti.status = 'active'
       WHERE t.id = $1
       LIMIT 1`, [travelId, userId]);
        const row = result.rows[0];
        if (!row) {
            throw new common_1.NotFoundException('여행을 찾을 수 없거나 접근 권한이 없습니다.');
        }
        // join 시에는 멤버 정보 로드 스킵으로 성능 개선
        const members = includeMembers
            ? (await this.loadMembersForTravels([travelId], userId)).get(travelId)
            : [];
        return this.mapSummary(row, members);
    }
    mapSummary(row, members) {
        const destinationCurrency = this.resolveDestinationCurrency(row.country_code, row.base_currency);
        const inviteCode = row.invite_code ?? undefined;
        const deepLink = inviteCode ? this.generateDeepLink(inviteCode) : undefined;
        return {
            id: row.id,
            title: row.title,
            startDate: row.start_date,
            endDate: row.end_date,
            countryCode: row.country_code,
            countryNameKr: row.country_name_kr ?? undefined,
            baseCurrency: row.base_currency,
            baseExchangeRate: row.base_exchange_rate ? Number(row.base_exchange_rate) : 0,
            destinationCurrency,
            countryCurrencies: Array.isArray(row.country_currencies) ? row.country_currencies : [],
            inviteCode,
            deepLink,
            status: row.status,
            createdAt: row.created_at,
            ownerName: row.owner_name ?? null,
            members: members ?? row.members ?? undefined,
        };
    }
    async getTravelDetail(travelId, userId) {
        const cached = await this.getCachedTravelDetail(travelId);
        if (cached) {
            const hasMembership = cached.members?.some(m => m.userId === userId) ?? false;
            if (hasMembership) {
                this.setMemberCache(travelId, userId, true);
                const hydrated = this.attachLinks(cached);
                return this.reorderMembersForUser(hydrated, userId);
            }
            let travelWithMembers = cached;
            // 멤버가 비어 있거나 누락된 경우 최신 멤버를 채워 캐시 갱신
            if (!cached.members || cached.members.length === 0) {
                const membersMap = await this.loadMembersForTravels([travelId], userId);
                travelWithMembers = { ...cached, members: membersMap.get(travelId) ?? [] };
                this.setCachedTravelDetail(travelId, travelWithMembers);
                if (travelWithMembers.members) {
                    this.setMemberListCache(travelId, travelWithMembers.members);
                }
            }
            // 캐시에 있으나 멤버십이 없다고 판단된 경우 DB로 확인 후 진행
            const memberCheck = await this.isMember(travelId, userId);
            if (!memberCheck) {
                throw new common_1.ForbiddenException('여행에 참여 중인 사용자만 조회할 수 있습니다.');
            }
            this.setMemberCache(travelId, userId, true);
            const hydrated = this.attachLinks(travelWithMembers);
            return this.reorderMembersForUser(hydrated, userId);
        }
        // 캐시에 없으면 DB에서 확인
        const member = await this.isMember(travelId, userId);
        if (!member) {
            throw new common_1.ForbiddenException('여행에 참여 중인 사용자만 조회할 수 있습니다.');
        }
        const travel = this.attachLinks(await this.fetchSummaryForMember(travelId, userId));
        this.setCachedTravelDetail(travelId, travel);
        if (travel.members) {
            this.setMemberListCache(travelId, travel.members);
        }
        return this.reorderMembersForUser(travel, userId);
    }
    async ensureCountryCurrencyMap() {
        if (this.countryCurrencyLoaded)
            return;
        if (this.countryCurrencyLoadPromise) {
            await this.countryCurrencyLoadPromise;
            return;
        }
        this.countryCurrencyLoadPromise = (async () => {
            try {
                const countries = await this.metaService.getCountries();
                for (const country of countries) {
                    const code = (country.code ?? '').toUpperCase();
                    const currency = country.currencies?.[0];
                    if (code && currency) {
                        this.countryCurrencyCache.set(code, currency.toUpperCase());
                    }
                }
                this.countryCurrencyLoaded = true;
            }
            catch (error) {
                this.logger.warn(`[travel] Failed to load country currencies: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
            finally {
                this.countryCurrencyLoadPromise = null;
            }
        })();
        await this.countryCurrencyLoadPromise;
    }
    resolveDestinationCurrency(countryCode, baseCurrency) {
        const code = (countryCode ?? '').toUpperCase();
        return this.countryCurrencyCache.get(code) ?? (baseCurrency ?? 'USD');
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
    normalizeDate(input, fieldName) {
        const pattern = /^\d{4}-\d{2}-\d{2}$/;
        if (!input || !pattern.test(input)) {
            throw new common_1.BadRequestException(`${fieldName}는 YYYY-MM-DD 형식이어야 합니다.`);
        }
        const parsed = new Date(`${input}T00:00:00`);
        if (Number.isNaN(parsed.getTime())) {
            throw new common_1.BadRequestException(`유효한 ${fieldName}가 아닙니다.`);
        }
        return input;
    }
    async ensureTransaction(callback) {
        const pool = await (0, pool_1.getPool)();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            this.logger.error('Transaction failed', error);
            throw error;
        }
        finally {
            client.release();
        }
    }
    async createTravel(currentUser, payload) {
        try {
            const startDate = this.normalizeDate(payload.startDate, 'startDate');
            const endDate = this.normalizeDate(payload.endDate, 'endDate');
            const travel = await this.ensureTransaction(async (client) => {
                const startTime = Date.now();
                const ownerName = currentUser.name ?? currentUser.email ?? '알 수 없는 사용자';
                // inviteCode 자동 생성
                const inviteCode = this.generateInviteCode();
                const insertResult = await client.query(`WITH new_travel AS (
             INSERT INTO travels (owner_id, title, start_date, end_date, country_code, country_name_kr, base_currency, base_exchange_rate, country_currencies, status)
             VALUES ($1, $2, to_date($3, 'YYYY-MM-DD'), to_date($4, 'YYYY-MM-DD'), $5, $6, $7, $8, $9, CASE WHEN to_date($4, 'YYYY-MM-DD') < CURRENT_DATE THEN 'archived' ELSE 'active' END)
             RETURNING id,
                       title,
                       start_date::date::text,
                       end_date::date::text,
                       country_code,
                       country_name_kr,
                       base_currency,
                       base_exchange_rate,
                       country_currencies,
                       status,
                       created_at
           ),
           owner_member AS (
             INSERT INTO travel_members (travel_id, user_id, role)
             SELECT new_travel.id, $1, 'owner'
             FROM new_travel
             ON CONFLICT (travel_id, user_id) DO UPDATE
             SET role = EXCLUDED.role
             RETURNING travel_id
           ),
           travel_invite AS (
             INSERT INTO travel_invites (travel_id, invite_code, created_by, status, expires_at, max_uses)
           SELECT new_travel.id, $10, $1, 'active', NULL, NULL
            FROM new_travel
            ON CONFLICT (invite_code) DO UPDATE SET invite_code = excluded.invite_code,
                                                     status = 'active',
                                                     used_count = 0,
                                                     expires_at = NULL,
                                                     max_uses = NULL
            RETURNING invite_code
          )
           SELECT new_travel.id::text AS id,
                  new_travel.title,
                  new_travel.start_date::date::text,
                  new_travel.end_date::date::text,
                  new_travel.country_code,
                  new_travel.country_name_kr,
                  new_travel.base_currency,
                  new_travel.base_exchange_rate,
                  new_travel.country_currencies,
                  travel_invite.invite_code,
                  new_travel.status,
                  new_travel.created_at::text
           FROM new_travel, travel_invite`, [
                    currentUser.id,
                    payload.title,
                    startDate,
                    endDate,
                    payload.countryCode,
                    payload.countryNameKr,
                    payload.baseCurrency,
                    payload.baseExchangeRate,
                    payload.countryCurrencies,
                    inviteCode,
                ]);
                const travelRow = insertResult.rows[0];
                await this.recordCurrencySnapshot(client, {
                    travelId: travelRow.id,
                    countryCode: travelRow.country_code,
                    baseCurrency: travelRow.base_currency,
                    baseExchangeRate: Number(travelRow.base_exchange_rate ?? payload.baseExchangeRate),
                });
                const optimizedResult = {
                    ...travelRow,
                    owner_name: ownerName,
                    members: [
                        {
                            userId: currentUser.id,
                            name: ownerName,
                            role: 'owner'
                        }
                    ],
                    country_currencies: travelRow.country_currencies ?? [],
                };
                const duration = Date.now() - startTime;
                this.logger.debug(`Travel created in ${duration}ms for user ${currentUser.id}`);
                await this.ensureCountryCurrencyMap();
                return this.mapSummary(optimizedResult, optimizedResult.members);
            });
            // 캐시 업데이트/무효화 (응답을 기다리지 않음)
            this.setMemberCache(travel.id, currentUser.id, true);
            this.invalidateUserTravelCache(currentUser.id);
            this.setCachedTravelDetail(travel.id, travel);
            this.setMemberListCache(travel.id, travel.members ?? []);
            return travel;
        }
        catch (error) {
            this.logger.error('Failed to create travel', error);
            throw new common_1.InternalServerErrorException('여행 생성에 실패했습니다.');
        }
    }
    async listTravels(userId, pagination = {}) {
        await this.ensureCountryCurrencyMap();
        const pool = await (0, pool_1.getPool)();
        const page = Math.max(1, pagination.page ?? 1);
        const limit = Math.min(100, Math.max(1, pagination.limit ?? 20));
        const offset = (page - 1) * limit;
        const statusCondition = this.buildStatusCondition(pagination.status, 't');
        const cacheKey = `${userId}:${page}:${limit}:${pagination.status ?? 'all'}`;
        const cachedList = await this.getCachedTravelList(cacheKey);
        if (cachedList) {
            // 캐시된 데이터에 딥링크/공유 링크 보강
            const itemsWithLinks = cachedList.map(item => this.attachLinks(item));
            return { total: cachedList.length, page, limit, items: itemsWithLinks };
        }
        const listResult = await pool.query(`SELECT
          ut.id::text AS id,
          ut.title,
          to_char(ut.start_date::date, 'YYYY-MM-DD') AS start_date,
          to_char(ut.end_date::date, 'YYYY-MM-DD') AS end_date,
          ut.country_code,
          ut.country_name_kr,
          ut.country_currencies,
          ut.base_currency,
          ut.base_exchange_rate,
         ti.invite_code,
         ut.computed_status AS status,
         ut.role,
         ut.created_at::text,
         owner_profile.name AS owner_name,
         ut.total_count
       FROM (
          SELECT t.*,
                 COALESCE(tm.role, mp.role, 'member') AS role,
                 CASE WHEN t.end_date < CURRENT_DATE THEN 'archived' ELSE 'active' END AS computed_status,
                 COUNT(*) OVER() AS total_count
          FROM travels t
          INNER JOIN travel_members tm ON tm.travel_id = t.id AND tm.user_id = $1
          LEFT JOIN profiles mp ON mp.id = tm.user_id
          WHERE 1 = 1
          ${statusCondition}
          ORDER BY t.created_at DESC
          LIMIT $2 OFFSET $3
        ) AS ut
        INNER JOIN profiles owner_profile ON owner_profile.id = ut.owner_id
        LEFT JOIN travel_invites ti ON ti.travel_id = ut.id AND ti.status = 'active'`, [userId, limit, offset]);
        const total = Number(listResult.rows[0]?.total_count ?? 0);
        // 동일 travel_id가 중복으로 내려오지 않도록 dedupe 후 멤버 로드
        const uniqueRows = Array.from(new Map(listResult.rows.map((row) => [row.id, row])).values());
        const travelIds = uniqueRows.map((row) => row.id);
        const membersMap = await this.loadMembersForTravels(travelIds, userId);
        const items = uniqueRows.map((row) => this.mapSummary(row, membersMap.get(row.id)));
        // 캐시에 저장 (Redis + 메모리) - 딥링크 없이 저장
        this.setCachedTravelList(cacheKey, items);
        return {
            total,
            page,
            limit,
            items: items.map(item => this.attachLinks(item)),
        };
    }
    generateInviteCode() {
        return (0, crypto_1.randomBytes)(5).toString('hex');
    }
    generateDeepLink(inviteCode) {
        // 카카오톡 공유용으로 웹 URL 형식 사용
        const base = (env_1.env.appBaseUrl || '').replace(/\/$/, '') || 'https://sseudam.up.railway.app';
        return `${base}/deeplink?inviteCode=${encodeURIComponent(inviteCode)}`;
    }
    async createInvite(travelId, userId) {
        const pool = await (0, pool_1.getPool)();
        await this.ensureOwner(travelId, userId, pool);
        const travelStatusResult = await pool.query(`SELECT CASE WHEN end_date < CURRENT_DATE THEN 'archived' ELSE 'active' END AS travel_status
       FROM travels
       WHERE id = $1
       LIMIT 1`, [travelId]);
        const travelStatus = travelStatusResult.rows[0]?.travel_status;
        if (!travelStatus) {
            throw new common_1.NotFoundException('여행을 찾을 수 없습니다.');
        }
        // 기존 초대 코드가 있는지 확인
        const existingInvite = await pool.query(`SELECT invite_code FROM travel_invites WHERE travel_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`, [travelId]);
        let inviteCode = existingInvite.rows[0]?.invite_code;
        // 없다면 새로 생성
        if (!inviteCode) {
            inviteCode = this.generateInviteCode();
            await pool.query(`INSERT INTO travel_invites (travel_id, invite_code, created_by, status, expires_at, max_uses)
         VALUES ($1, $2, $3, 'active', NULL, NULL)
         ON CONFLICT (invite_code) DO UPDATE SET status = 'active',
                                                used_count = 0,
                                                expires_at = NULL,
                                                max_uses = NULL`, [travelId, inviteCode, userId]);
        }
        await this.setCachedInvite(inviteCode, {
            travel_id: travelId,
            status: 'active',
            used_count: 0,
            max_uses: null,
            expires_at: null,
            travel_status: travelStatus,
        });
        return {
            inviteCode,
            deepLink: this.generateDeepLink(inviteCode),
        };
    }
    attachLinks(travel) {
        if (!travel.inviteCode)
            return travel;
        return {
            ...travel,
            deepLink: this.generateDeepLink(travel.inviteCode),
        };
    }
    async invalidateExpenseAndSettlementCaches(travelId) {
        await Promise.all([
            this.cacheService.delPattern(`expense:list:${travelId}:*`).catch(() => undefined),
            this.cacheService.delPattern(`expense:detail:${travelId}:*`).catch(() => undefined),
            this.cacheService.del(travelId, { prefix: 'expense:context' }).catch(() => undefined),
            this.cacheService.del(travelId, { prefix: 'settlement:summary' }).catch(() => undefined),
        ]);
    }
    async deleteTravel(travelId, userId) {
        const pool = await (0, pool_1.getPool)();
        await this.ensureOwner(travelId, userId, pool);
        const members = await pool.query(`SELECT user_id FROM travel_members WHERE travel_id = $1`, [travelId]);
        await this.ensureTransaction(async (client) => {
            await client.query(`WITH expense_ids AS (
           SELECT id FROM travel_expenses WHERE travel_id = $1
         ),
         deleted_participants AS (
           DELETE FROM travel_expense_participants WHERE expense_id IN (SELECT id FROM expense_ids)
         ),
         deleted_expenses AS (
           DELETE FROM travel_expenses WHERE id IN (SELECT id FROM expense_ids)
         ),
         deleted_settlements AS (
           DELETE FROM travel_settlements WHERE travel_id = $1
         ),
         deleted_invites AS (
           DELETE FROM travel_invites WHERE travel_id = $1
         ),
         deleted_members AS (
           DELETE FROM travel_members WHERE travel_id = $1
         )
         DELETE FROM travels WHERE id = $1`, [travelId]);
        });
        // 초대 코드 캐시 전부 무효화 (travelId별 키가 없으므로 패턴 삭제)
        this.cacheService.delPattern(`${this.INVITE_REDIS_PREFIX}:*`).catch(() => undefined);
        // 관련 캐시 무효화
        this.invalidateTravelDetailCache(travelId);
        members.rows.forEach(member => this.invalidateUserTravelCache(member.user_id));
        await this.invalidateMembersCacheForTravel(travelId);
    }
    async transferOwnership(travelId, currentOwnerId, newOwnerId) {
        const pool = await (0, pool_1.getPool)();
        await this.ensureOwner(travelId, currentOwnerId, pool);
        if (currentOwnerId === newOwnerId) {
            throw new common_1.BadRequestException('이미 호스트입니다.');
        }
        await this.ensureTransaction(async (client) => {
            const travelRow = await client.query(`SELECT owner_id FROM travels WHERE id = $1 LIMIT 1 FOR UPDATE`, [travelId]);
            if (!travelRow.rows[0]) {
                throw new common_1.NotFoundException('여행을 찾을 수 없습니다.');
            }
            const memberRow = await client.query(`SELECT 1 FROM travel_members WHERE travel_id = $1 AND user_id = $2 LIMIT 1`, [travelId, newOwnerId]);
            if (!memberRow.rows[0]) {
                throw new common_1.BadRequestException('새 호스트가 여행 멤버가 아닙니다.');
            }
            // 기존 호스트를 멤버로, 새 호스트를 owner로 설정하고 travels.owner_id 업데이트
            const demoteResult = await client.query(`UPDATE travel_members
         SET role = 'member'
         WHERE travel_id = $1 AND user_id = $2`, [travelId, currentOwnerId]);
            if ((demoteResult.rowCount ?? 0) === 0) {
                throw new common_1.BadRequestException('현재 호스트를 멤버로 변경하지 못했습니다.');
            }
            const promoteResult = await client.query(`UPDATE travel_members
         SET role = 'owner'
         WHERE travel_id = $1 AND user_id = $2`, [travelId, newOwnerId]);
            if ((promoteResult.rowCount ?? 0) === 0) {
                throw new common_1.BadRequestException('새 호스트를 설정하지 못했습니다.');
            }
            await client.query(`UPDATE travels
         SET owner_id = $2
         WHERE id = $1`, [travelId, newOwnerId]);
        });
        // 멤버/권한 변경 직후 캐시를 비워 최신 멤버 목록을 강제로 조회
        await this.invalidateMembersCacheForTravel(travelId);
        // 트랜잭션 커밋 후 최신 상태 조회
        const summary = await this.fetchSummaryForMember(travelId, newOwnerId);
        // 캐시 무효화 및 최신 상세 캐시 저장
        this.invalidateTravelDetailCache(travelId);
        this.setCachedTravelDetail(travelId, summary);
        // 모든 멤버의 리스트 캐시 무효화
        const members = await pool.query(`SELECT user_id FROM travel_members WHERE travel_id = $1`, [travelId]);
        members.rows.forEach(member => this.invalidateUserTravelCache(member.user_id));
        return summary;
    }
    async joinByInviteCode(userId, inviteCode) {
        const pool = await (0, pool_1.getPool)();
        let inviteRow = await this.getCachedInvite(inviteCode);
        let fetchedFromCache = !!inviteRow;
        if (!inviteRow) {
            const inviteResult = await pool.query(`SELECT ti.travel_id,
                ti.status,
                ti.used_count,
                ti.max_uses,
                ti.expires_at,
                CASE WHEN t.end_date < CURRENT_DATE THEN 'archived' ELSE 'active' END AS travel_status
         FROM travel_invites ti
         INNER JOIN travels t ON t.id = ti.travel_id
         WHERE ti.invite_code = $1
         ORDER BY ti.created_at DESC
         LIMIT 1`, [inviteCode]);
            inviteRow = inviteResult.rows[0];
            if (!inviteRow) {
                throw new common_1.NotFoundException('유효하지 않은 초대 코드입니다.');
            }
            await this.setCachedInvite(inviteCode, inviteRow);
            fetchedFromCache = false;
        }
        // 캐시된 데이터 신뢰 (TTL을 짧게 유지하여 신뢰성 확보)
        // 기존 중복 쿼리 제거로 성능 개선
        if (inviteRow.status !== 'active' || inviteRow.travel_status !== 'active') {
            throw new common_1.BadRequestException('만료되었거나 비활성화된 초대 코드입니다.');
        }
        if (inviteRow.max_uses && inviteRow.used_count >= inviteRow.max_uses) {
            throw new common_1.BadRequestException('모집 인원을 초과한 초대 코드입니다.');
        }
        if (await this.isMember(inviteRow.travel_id, userId, pool)) {
            throw new common_1.BadRequestException('이미 참여 중인 여행입니다.');
        }
        await this.ensureTransaction(async (client) => {
            await client.query(`INSERT INTO travel_members (travel_id, user_id, role)
         VALUES ($1, $2, 'member')
         ON CONFLICT (travel_id, user_id) DO NOTHING`, [inviteRow.travel_id, userId]);
            await client.query(`UPDATE travel_invites
         SET used_count = used_count + 1
         WHERE invite_code = $1`, [inviteCode]);
            // 초대 코드로 참여하면 프로필 역할을 member로 설정 (user인 경우만)
            await client.query(`UPDATE profiles
         SET role = 'member'
         WHERE id = $1
           AND role = 'user'`, [userId]);
        });
        // 초대 코드 캐시 무효화
        this.invalidateInvite(inviteCode);
        // 새 멤버 참여 후 캐시 무효화
        this.invalidateUserTravelCache(userId);
        this.invalidateTravelDetailCache(inviteRow.travel_id);
        // 기존 멤버들의 여행 목록 캐시도 무효화 (멤버 정보가 변경되므로)
        await this.invalidateTravelCachesForMembers(inviteRow.travel_id);
        await this.invalidateMembersCacheForTravel(inviteRow.travel_id);
        // 멤버십 캐시 업데이트: 이후 상세 조회/권한 체크 시 DB 조회를 생략
        this.setMemberCache(inviteRow.travel_id, userId, true);
        // 멤버 포함 최신 상세를 즉시 조회해 캐시에 반영 (join 직후 멤버 목록 비어있는 문제 방지)
        const travelSummary = this.attachLinks(await this.fetchSummaryForMember(inviteRow.travel_id, userId, true));
        this.setCachedTravelDetail(inviteRow.travel_id, travelSummary);
        if (travelSummary.members) {
            this.setMemberListCache(inviteRow.travel_id, travelSummary.members);
        }
        // 새 멤버 추가 알림 이벤트 발송
        if (travelSummary.members && travelSummary.members.length > 0) {
            const pool = await (0, pool_1.getPool)();
            const userNameResult = await pool.query(`SELECT name FROM profiles WHERE id = $1`, [userId]);
            const currentUserName = userNameResult.rows[0]?.name || '새 멤버';
            const memberIds = travelSummary.members.map(m => m.userId);
            await this.pushNotificationService.sendTravelNotification('travel_member_added', inviteRow.travel_id, userId, currentUserName, travelSummary.title, memberIds);
        }
        return this.reorderMembersForUser(travelSummary, userId);
    }
    async leaveTravel(travelId, userId) {
        const pool = await (0, pool_1.getPool)();
        let travelTitle = '';
        let memberIds = [];
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const membership = await client.query(`SELECT tm.role, t.owner_id, t.title,
                (SELECT COUNT(*)::int FROM travel_members WHERE travel_id = $1) AS member_count
         FROM travel_members tm
         INNER JOIN travels t ON t.id = tm.travel_id
         WHERE tm.travel_id = $1 AND tm.user_id = $2
         LIMIT 1
         FOR UPDATE`, [travelId, userId]);
            const row = membership.rows[0];
            if (!row) {
                throw new common_1.NotFoundException('여행을 찾을 수 없거나 멤버가 아닙니다.');
            }
            travelTitle = row.title;
            // 소유자(owner)는 여행을 나갈 수 없음
            if (row.role === 'owner' || row.owner_id === userId) {
                throw new common_1.ForbiddenException('여행 호스트는 나갈 수 없습니다. 다른 멤버에게 호스트 권한을 위임하거나 여행을 삭제해주세요.');
            }
            // 알림 발송용 멤버 목록 조회 (나가기 전)
            const membersResult = await client.query(`SELECT user_id FROM travel_members WHERE travel_id = $1`, [travelId]);
            memberIds = membersResult.rows.map(m => m.user_id);
            // 일반 멤버 탈퇴: 멤버만 제거, 데이터 유지
            await client.query(`DELETE FROM travel_members WHERE travel_id = $1 AND user_id = $2`, [travelId, userId]);
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
        // 멤버 탈퇴 후 관련 캐시 무효화
        this.invalidateUserTravelCache(userId);
        this.invalidateTravelDetailCache(travelId);
        await this.invalidateMemberCache(travelId, userId);
        // 다른 멤버들의 목록/멤버십 캐시도 무효화해 즉시 반영
        await this.invalidateTravelCachesForMembers(travelId);
        await this.invalidateMembersCacheForTravel(travelId);
        // 멤버 나가기 알림 이벤트 발송
        if (memberIds.length > 0 && travelTitle) {
            const userNameResult = await pool.query(`SELECT name FROM profiles WHERE id = $1`, [userId]);
            const currentUserName = userNameResult.rows[0]?.name || '멤버';
            await this.pushNotificationService.sendTravelNotification('travel_member_removed', travelId, userId, currentUserName, travelTitle, memberIds);
        }
        return { deletedTravel: false };
    }
    async updateTravel(travelId, userId, payload) {
        const travelRow = await this.ensureTransaction(async (client) => {
            // 소유자 확인 + 행 잠금
            const ownerCheck = await client.query(`SELECT 1 FROM travels WHERE id = $1 AND owner_id = $2 LIMIT 1 FOR UPDATE`, [travelId, userId]);
            if (!ownerCheck.rows[0]) {
                const exists = await client.query(`SELECT 1 FROM travels WHERE id = $1 LIMIT 1`, [travelId]);
                if (!exists.rows[0]) {
                    throw new common_1.NotFoundException('여행을 찾을 수 없습니다.');
                }
                throw new common_1.ForbiddenException('여행 수정 권한이 없습니다.');
            }
            const result = await client.query(`UPDATE travels
         SET title = $3,
             start_date = to_date($4, 'YYYY-MM-DD'),
             end_date = to_date($5, 'YYYY-MM-DD'),
             country_code = $6,
             country_name_kr = $7,
             base_currency = $8,
             base_exchange_rate = $9,
             country_currencies = $10,
             status = CASE WHEN $5 < CURRENT_DATE THEN 'archived' ELSE 'active' END,
             updated_at = NOW()
         WHERE id = $1 AND owner_id = $2
         RETURNING
           id::text AS id,
           title,
           start_date::date::text,
           end_date::date::text,
           country_code,
           country_name_kr,
           base_currency,
           base_exchange_rate,
           country_currencies,
           invite_code,
           status,
           created_at::text`, [
                travelId,
                userId,
                payload.title,
                this.normalizeDate(payload.startDate, 'startDate'),
                this.normalizeDate(payload.endDate, 'endDate'),
                payload.countryCode,
                payload.countryNameKr,
                payload.baseCurrency,
                payload.baseExchangeRate,
                payload.countryCurrencies,
            ]);
            const row = result.rows[0];
            if (row) {
                await this.recordCurrencySnapshot(client, {
                    travelId,
                    countryCode: row.country_code,
                    baseCurrency: row.base_currency,
                    baseExchangeRate: Number(row.base_exchange_rate ?? payload.baseExchangeRate),
                });
            }
            return row;
        });
        // 수정 후 관련 캐시 무효화
        this.invalidateTravelDetailCache(travelId);
        // 업데이트한 사용자의 여행 목록 캐시 직접 무효화
        this.invalidateUserTravelCache(userId);
        // 여행에 참여한 모든 멤버의 목록 캐시도 무효화 (최적화된 패턴 삭제)
        await this.invalidateTravelCachesForMembers(travelId);
        // 🔥 임시: 강제 전체 캐시 클리어 (디버깅용)
        this.logger.warn(`[CACHE-DEBUG] updateTravel: Forcing cache clear for travel ${travelId}, user ${userId}`);
        this.travelListCache.clear();
        this.travelDetailCache.clear();
        await this.cacheService.delPattern(`${this.TRAVEL_LIST_REDIS_PREFIX}:*`).catch(() => undefined);
        await this.cacheService.delPattern(`${this.TRAVEL_DETAIL_REDIS_PREFIX}:*`).catch(() => undefined);
        // 통화/정산 관련 캐시도 무효화하여 최신 환율/금액 반영
        await this.invalidateExpenseAndSettlementCaches(travelId);
        // 업데이트 직후 바로 최신 멤버 정보를 내려주는 게 API UX에 맞음
        const summary = await this.fetchSummaryForMember(travelId, userId, true);
        // 결과 캐시에 저장 (후속 요청 성능 개선)
        this.setCachedTravelDetail(travelId, summary);
        // 여행 수정 알림 이벤트 발송
        if (summary.members && summary.members.length > 0) {
            const pool = await (0, pool_1.getPool)();
            const userNameResult = await pool.query(`SELECT name FROM profiles WHERE id = $1`, [userId]);
            const currentUserName = userNameResult.rows[0]?.name || '사용자';
            const memberIds = summary.members.map(m => m.userId);
            await this.pushNotificationService.sendTravelNotification('travel_updated', travelId, userId, currentUserName, payload.title, memberIds);
        }
        return summary;
    }
    async removeMember(travelId, ownerId, memberId) {
        const pool = await (0, pool_1.getPool)();
        await this.ensureOwner(travelId, ownerId, pool);
        if (ownerId === memberId) {
            throw new common_1.BadRequestException('호스트는 스스로를 삭제할 수 없습니다.');
        }
        let travelTitle = '';
        let memberIds = [];
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // 여행 정보와 멤버 목록 조회 (삭제 전)
            const travelResult = await client.query(`SELECT title FROM travels WHERE id = $1`, [travelId]);
            travelTitle = travelResult.rows[0]?.title || '';
            const membersResult = await client.query(`SELECT user_id FROM travel_members WHERE travel_id = $1`, [travelId]);
            memberIds = membersResult.rows.map(m => m.user_id);
            const target = await client.query(`SELECT 1 FROM travel_members WHERE travel_id = $1 AND user_id = $2 FOR UPDATE`, [travelId, memberId]);
            if (!target.rows[0]) {
                throw new common_1.NotFoundException('멤버를 찾을 수 없습니다.');
            }
            await client.query(`DELETE FROM travel_members WHERE travel_id = $1 AND user_id = $2`, [travelId, memberId]);
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
        // 멤버 삭제 후 캐시 무효화
        this.invalidateUserTravelCache(memberId);
        this.invalidateTravelDetailCache(travelId);
        await this.invalidateMemberCache(travelId, memberId);
        // 다른 멤버들의 여행 목록 캐시도 무효화 (멤버 정보가 변경되므로)
        await this.invalidateTravelCachesForMembers(travelId);
        await this.invalidateMembersCacheForTravel(travelId);
        // 멤버 삭제 알림 이벤트 발송
        if (memberIds.length > 0 && travelTitle) {
            const ownerNameResult = await pool.query(`SELECT name FROM profiles WHERE id = $1`, [ownerId]);
            const ownerName = ownerNameResult.rows[0]?.name || '호스트';
            await this.pushNotificationService.sendTravelNotification('travel_member_removed', travelId, ownerId, ownerName, travelTitle, memberIds);
        }
    }
    /**
     * 사용자가 참여 중인 모든 여행의 멤버 목록을 조회
     */
    async getTravelMembersForUser(userId) {
        const pool = await (0, pool_1.getPool)();
        // 사용자가 참여 중인 여행 목록과 해당 여행의 모든 멤버 정보를 한 번에 조회
        const result = await pool.query(`SELECT
         t.id::text AS travel_id,
         t.title AS travel_title,
         tm_all.user_id::text AS member_user_id,
         tm_all.role AS member_role,
         p.name AS member_name,
         p.email AS member_email,
         p.avatar_url AS member_avatar
       FROM travels t
       INNER JOIN travel_members tm_user ON tm_user.travel_id = t.id AND tm_user.user_id = $1
       INNER JOIN travel_members tm_all ON tm_all.travel_id = t.id
       LEFT JOIN profiles p ON p.id = tm_all.user_id
       ORDER BY t.title,
                CASE WHEN tm_all.role = 'owner' THEN 0 ELSE 1 END,
                tm_all.joined_at`, [userId]);
        // 결과를 여행별로 그룹화
        const travelMembersMap = new Map();
        for (const row of result.rows) {
            const { travel_id, travel_title, member_user_id, member_role, member_name, member_email, member_avatar } = row;
            if (!travelMembersMap.has(travel_id)) {
                travelMembersMap.set(travel_id, {
                    travelId: travel_id,
                    travelTitle: travel_title,
                    members: []
                });
            }
            const travelMembers = travelMembersMap.get(travel_id);
            travelMembers.members.push({
                userId: member_user_id,
                name: member_name,
                email: member_email ?? null,
                avatarUrl: member_avatar ?? null,
                role: member_role
            });
        }
        return Array.from(travelMembersMap.values());
    }
    /**
     * 특정 여행의 멤버 목록 조회
     */
    async getTravelMembersByTravelId(travelId, requestingUserId) {
        const pool = await (0, pool_1.getPool)();
        // 요청하는 사용자가 해당 여행의 멤버인지 확인
        const memberCheckResult = await pool.query('SELECT 1 FROM travel_members WHERE travel_id = $1 AND user_id = $2', [travelId, requestingUserId]);
        if (memberCheckResult.rows.length === 0) {
            throw new common_1.NotFoundException('여행을 찾을 수 없거나 접근 권한이 없습니다.');
        }
        // 해당 여행의 모든 멤버 목록 조회
        const result = await pool.query(`SELECT
         tm.user_id::text AS user_id,
         tm.role,
         p.name,
         p.email,
         p.avatar_url
       FROM travel_members tm
       LEFT JOIN profiles p ON p.id = tm.user_id
       WHERE tm.travel_id = $1
       ORDER BY CASE WHEN tm.role = 'owner' THEN 0 ELSE 1 END,
                tm.joined_at`, [travelId]);
        return result.rows.map((row) => ({
            userId: row.user_id,
            name: row.name ?? null,
            email: row.email ?? null,
            avatarUrl: row.avatar_url ?? null,
            role: row.role
        }));
    }
};
exports.TravelService = TravelService;
exports.TravelService = TravelService = TravelService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [meta_service_1.MetaService,
        cacheService_1.CacheService,
        event_emitter_1.EventEmitter2,
        push_notification_service_1.PushNotificationService])
], TravelService);
