import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Pool, PoolClient } from 'pg';
import { getPool } from '../../db/pool';
import { CreateTravelInput } from '../../validators/travelSchemas';
import { UserRecord } from '../../types/user';
import { MetaService } from '../meta/meta.service';
import { CacheService } from '../../services/cacheService';
import { env } from '../../config/env';

export interface TravelSummary {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  countryCode: string;
  countryNameKr?: string;
  baseCurrency: string;
  baseExchangeRate: number;
  destinationCurrency: string;
  inviteCode?: string;
  deepLink?: string;
  status: string;
  createdAt: string;
  ownerName: string | null;
  members?: TravelMember[];
}

export interface TravelDetail extends TravelSummary {}

export interface TravelInvitePayload {
  inviteCode: string;
  deepLink: string;
}

export interface TravelMember {
  userId: string;
  name: string | null;
  role: string;
}

@Injectable()
export class TravelService {
  private readonly logger = new Logger(TravelService.name);
  private readonly countryCurrencyCache = new Map<string, string>();
  private countryCurrencyLoaded = false;
  private countryCurrencyLoadPromise: Promise<void> | null = null;

  // 여행 목록 캐시: 30초 TTL, 사용자별 캐시
  private readonly travelListCache = new Map<string, { data: TravelSummary[]; expiresAt: number }>();
  private readonly TRAVEL_LIST_CACHE_TTL = 30 * 1000; // 30초로 단축하여 최신 반영
  private readonly MAX_CACHE_SIZE = 1000;

  // 여행 상세 캐시: 30초 TTL
  private readonly travelDetailCache = new Map<string, { data: TravelDetail; expiresAt: number }>();
  private readonly TRAVEL_DETAIL_CACHE_TTL = 30 * 1000; // 30초로 단축하여 최신 반영
  private readonly TRAVEL_LIST_REDIS_PREFIX = 'travel:list';
  private readonly TRAVEL_DETAIL_REDIS_PREFIX = 'travel:detail';
  private readonly INVITE_REDIS_PREFIX = 'invite:code';
  private readonly INVITE_TTL_SECONDS = 5 * 60;
  private readonly TRAVEL_MEMBER_CACHE = new Map<string, { exists: boolean; expiresAt: number }>();
  private readonly TRAVEL_MEMBER_TTL = 2 * 60 * 1000; // 2분
  private readonly TRAVEL_MEMBER_REDIS_PREFIX = 'travel:member';
  private readonly TRAVEL_MEMBER_REDIS_TTL = 2 * 60; // 2분

  constructor(
    private readonly metaService: MetaService,
    private readonly cacheService: CacheService = new CacheService(),
  ) {}

  private async getCachedTravelList(key: string, rawKey = false): Promise<TravelSummary[] | null> {
    const cacheKey = rawKey ? key : `${key}`;
    // Redis 우선
    try {
      const redisData = await this.cacheService.get<TravelSummary[]>(cacheKey, {
        prefix: this.TRAVEL_LIST_REDIS_PREFIX,
      });
      if (redisData) {
        this.travelListCache.set(cacheKey, { data: redisData, expiresAt: Date.now() + this.TRAVEL_LIST_CACHE_TTL });
        return redisData;
      }
    } catch (error) {
      this.logger.warn(`[Travel] Redis travel list miss for ${cacheKey}:`, error);
    }

    const cached = this.travelListCache.get(cacheKey);
    if (!cached || Date.now() > cached.expiresAt) {
      this.travelListCache.delete(cacheKey);
      return null;
    }
    return cached.data;
  }

  private setCachedTravelList(key: string, travels: TravelSummary[], rawKey = false): void {
    const cacheKey = rawKey ? key : `${key}`;
    if (this.travelListCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.travelListCache.keys().next().value;
      if (oldestKey) this.travelListCache.delete(oldestKey);
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

  private async getCachedTravelDetail(travelId: string): Promise<TravelDetail | null> {
    // Redis 우선
    try {
      const redisData = await this.cacheService.get<TravelDetail>(travelId, {
        prefix: this.TRAVEL_DETAIL_REDIS_PREFIX,
      });
      if (redisData) {
        this.travelDetailCache.set(travelId, { data: redisData, expiresAt: Date.now() + this.TRAVEL_DETAIL_CACHE_TTL });
        return redisData;
      }
    } catch (error) {
      this.logger.warn(`[Travel] Redis travel detail miss for ${travelId}:`, error);
    }

    const cached = this.travelDetailCache.get(travelId);
    if (!cached || Date.now() > cached.expiresAt) {
      this.travelDetailCache.delete(travelId);
      return null;
    }
    return cached.data;
  }

  private setCachedTravelDetail(travelId: string, travel: TravelDetail): void {
    if (this.travelDetailCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.travelDetailCache.keys().next().value;
      if (oldestKey) this.travelDetailCache.delete(oldestKey);
    }
    this.travelDetailCache.set(travelId, {
      data: travel,
      expiresAt: Date.now() + this.TRAVEL_DETAIL_CACHE_TTL
    });

    this.cacheService.set(travelId, travel, {
      prefix: this.TRAVEL_DETAIL_REDIS_PREFIX,
      ttl: Math.floor(this.TRAVEL_DETAIL_CACHE_TTL / 1000),
    }).catch(() => undefined);
  }

  private invalidateUserTravelCache(userId: string): void {
    const keys = Array.from(this.travelListCache.keys()).filter(key => key.startsWith(`${userId}:`));
    keys.forEach(key => this.travelListCache.delete(key));
    this.cacheService.delPattern(`${this.TRAVEL_LIST_REDIS_PREFIX}:${userId}:*`).catch(() => undefined);
  }

  private invalidateTravelDetailCache(travelId: string): void {
    this.travelDetailCache.delete(travelId);
    this.cacheService.del(travelId, { prefix: this.TRAVEL_DETAIL_REDIS_PREFIX }).catch(() => undefined);
  }

  private async invalidateTravelCachesForMembers(travelId: string): Promise<void> {
    // Redis 패턴 기반 삭제로 N+1 쿼리 제거
    try {
      await this.cacheService.delPattern(`${this.TRAVEL_LIST_REDIS_PREFIX}:*:*:${travelId}`);
    } catch (error) {
      console.warn('Pattern-based cache invalidation failed, falling back to individual deletion:', error);

      // 패턴 삭제 실패 시만 기존 방식 사용
      const pool = await getPool();
      const members = await pool.query(
        `SELECT user_id FROM travel_members WHERE travel_id = $1`,
        [travelId]
      );
      members.rows.forEach(member => this.invalidateUserTravelCache(member.user_id));
    }
  }

  private async getCachedInvite(inviteCode: string): Promise<{ travel_id: string; status: string; used_count: number; max_uses: number | null; expires_at: string | null; travel_status: string } | null> {
    try {
      return await this.cacheService.get(inviteCode, { prefix: this.INVITE_REDIS_PREFIX });
    } catch {
      return null;
    }
  }

  // 요청자 기준으로 멤버 배열을 재정렬 (요청자 우선)
  private reorderMembersForUser<T extends { members?: TravelMember[] }>(travel: T, userId: string): T {
    if (!travel.members || travel.members.length === 0) {
      return travel;
    }
    const mine = travel.members.filter(m => m.userId === userId);
    const others = travel.members.filter(m => m.userId !== userId);
    return { ...travel, members: [...mine, ...others] };
  }

  private async setCachedInvite(inviteCode: string, payload: any): Promise<void> {
    this.cacheService.set(inviteCode, payload, { prefix: this.INVITE_REDIS_PREFIX, ttl: this.INVITE_TTL_SECONDS }).catch(() => undefined);
  }

  private invalidateInvite(inviteCode: string): void {
    this.cacheService.del(inviteCode, { prefix: this.INVITE_REDIS_PREFIX }).catch(() => undefined);
  }

  private getMembershipCacheKey(travelId: string, userId: string): string {
    return `${travelId}:${userId}`;
  }

  private async isMemberCached(travelId: string, userId: string): Promise<boolean | null> {
    const key = this.getMembershipCacheKey(travelId, userId);
    const cached = this.TRAVEL_MEMBER_CACHE.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.exists;
    }
    try {
      const redisCached = await this.cacheService.get<boolean>(key, { prefix: this.TRAVEL_MEMBER_REDIS_PREFIX });
      if (typeof redisCached === 'boolean') {
        this.TRAVEL_MEMBER_CACHE.set(key, { exists: redisCached, expiresAt: Date.now() + this.TRAVEL_MEMBER_TTL });
        return redisCached;
      }
    } catch {
      // ignore
    }
    return null;
  }

  private setMemberCache(travelId: string, userId: string, exists: boolean): void {
    const key = this.getMembershipCacheKey(travelId, userId);
    this.TRAVEL_MEMBER_CACHE.set(key, { exists, expiresAt: Date.now() + this.TRAVEL_MEMBER_TTL });
    this.cacheService.set(key, exists, {
      prefix: this.TRAVEL_MEMBER_REDIS_PREFIX,
      ttl: this.TRAVEL_MEMBER_REDIS_TTL,
    }).catch(() => undefined);
  }

  private async invalidateMemberCache(travelId: string, userId: string): Promise<void> {
    const key = this.getMembershipCacheKey(travelId, userId);
    this.TRAVEL_MEMBER_CACHE.delete(key);
    await this.cacheService.del(key, { prefix: this.TRAVEL_MEMBER_REDIS_PREFIX }).catch(() => undefined);
  }

  private async invalidateMembersCacheForTravel(travelId: string): Promise<void> {
    const keys = Array.from(this.TRAVEL_MEMBER_CACHE.keys()).filter(k => k.startsWith(`${travelId}:`));
    keys.forEach(k => this.TRAVEL_MEMBER_CACHE.delete(k));
    await this.cacheService.delPattern(`${this.TRAVEL_MEMBER_REDIS_PREFIX}:${travelId}:*`).catch(() => undefined);
  }

  private async loadMembersForTravels(travelIds: string[], requesterId: string): Promise<Map<string, TravelMember[]>> {
    const membersMap = new Map<string, TravelMember[]>();
    if (travelIds.length === 0) {
      return membersMap;
    }

    const pool = await getPool();
    const result = await pool.query(
      `SELECT
         tm.travel_id::text AS travel_id,
         tm.user_id::text AS user_id,
         tm.role,
         p.name,
         tm.joined_at
       FROM travel_members tm
       LEFT JOIN profiles p ON p.id = tm.user_id
       WHERE tm.travel_id = ANY($1::uuid[])
       ORDER BY tm.travel_id,
                CASE WHEN tm.user_id = $2 THEN 0 ELSE 1 END,
                tm.joined_at`,
      [travelIds, requesterId],
    );

    for (const row of result.rows) {
      const list = membersMap.get(row.travel_id) ?? [];
      list.push({
        userId: row.user_id,
        name: row.name ?? null,
        role: row.role ?? 'member',
      });
      membersMap.set(row.travel_id, list);
    }

    return membersMap;
  }

  private async ensureOwner(travelId: string, userId: string, runner?: Pool | PoolClient): Promise<void> {
    const executor = runner ?? (await getPool());
    const result = await executor.query(
      `SELECT owner_id FROM travels WHERE id = $1`,
      [travelId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('여행을 찾을 수 없습니다.');
    }
    if (row.owner_id !== userId) {
      throw new ForbiddenException('여행 호스트만 수행할 수 있는 작업입니다.');
    }
  }

  private async isMember(travelId: string, userId: string, runner?: Pool | PoolClient): Promise<boolean> {
    const cached = await this.isMemberCached(travelId, userId);
    if (cached !== null) return cached;

    const executor = runner ?? (await getPool());
    const result = await executor.query(
      `SELECT 1 FROM travel_members WHERE travel_id = $1 AND user_id = $2 LIMIT 1`,
      [travelId, userId],
    );
    const exists = Boolean(result.rows[0]);
    this.setMemberCache(travelId, userId, exists);
    return exists;
  }

  private async fetchSummaryForMember(travelId: string, userId: string, includeMembers: boolean = true): Promise<TravelSummary> {
    await this.ensureCountryCurrencyMap();

    const pool = await getPool();
    const result = await pool.query(
      `SELECT
         t.id::text AS id,
         t.title,
         t.start_date::text,
         t.end_date::text,
         t.country_code,
         t.country_name_kr,
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
       LIMIT 1`,
      [travelId, userId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('여행을 찾을 수 없거나 접근 권한이 없습니다.');
    }

    // join 시에는 멤버 정보 로드 스킵으로 성능 개선
    const members = includeMembers
      ? (await this.loadMembersForTravels([travelId], userId)).get(travelId)
      : [];

    return this.mapSummary(row, members);
  }

  private mapSummary(row: any, members?: TravelMember[]): TravelSummary {
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
      baseExchangeRate: Number(row.base_exchange_rate),
      destinationCurrency,
      inviteCode,
      deepLink,
      status: row.status,
      createdAt: row.created_at,
      ownerName: row.owner_name ?? null,
      members: members ?? row.members ?? undefined,
    };
  }

  async getTravelDetail(travelId: string, userId: string): Promise<TravelDetail> {
    // 멤버십 검증을 먼저 수행하여 캐시된 데이터로 인한 권한 우회 방지
    const member = await this.isMember(travelId, userId);
    if (!member) {
      throw new ForbiddenException('여행에 참여 중인 사용자만 조회할 수 있습니다.');
    }

    const cached = await this.getCachedTravelDetail(travelId);
    if (cached) {
      const hydrated = this.attachLinks(cached);
      return this.reorderMembersForUser(hydrated, userId);
    }

    const travel = this.attachLinks(await this.fetchSummaryForMember(travelId, userId));

    this.setCachedTravelDetail(travelId, travel);
    return this.reorderMembersForUser(travel, userId);
  }

  private async ensureCountryCurrencyMap(): Promise<void> {
    if (this.countryCurrencyLoaded) return;
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
      } catch (error) {
        this.logger.warn(
          `[travel] Failed to load country currencies: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      } finally {
        this.countryCurrencyLoadPromise = null;
      }
    })();

    await this.countryCurrencyLoadPromise;
  }

  private resolveDestinationCurrency(countryCode: string, baseCurrency?: string | null): string {
    const code = (countryCode ?? '').toUpperCase();
    return this.countryCurrencyCache.get(code) ?? (baseCurrency ?? 'USD');
  }

  private buildStatusCondition(status: 'active' | 'archived' | undefined, alias: string): string {
    if (status === 'active') {
      return `AND ${alias}.end_date >= CURRENT_DATE`;
    }
    if (status === 'archived') {
      return `AND ${alias}.end_date < CURRENT_DATE`;
    }
    return '';
  }

  private async ensureTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const pool = await getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Transaction failed', error as Error);
      throw error;
    } finally {
      client.release();
    }
  }

  async createTravel(currentUser: UserRecord, payload: CreateTravelInput): Promise<TravelDetail> {
    try {
      const travel = await this.ensureTransaction(async (client) => {
        const startTime = Date.now();
        const ownerName = currentUser.name ?? currentUser.email ?? '알 수 없는 사용자';

        // inviteCode 자동 생성
        const inviteCode = this.generateInviteCode();

        const insertResult = await client.query(
          `WITH new_travel AS (
             INSERT INTO travels (owner_id, title, start_date, end_date, country_code, country_name_kr, base_currency, base_exchange_rate, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $4 < CURRENT_DATE THEN 'archived' ELSE 'active' END)
             RETURNING id,
                       title,
                       start_date,
                       end_date,
                       country_code,
                       country_name_kr,
                       base_currency,
                       base_exchange_rate,
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
             SELECT new_travel.id, $9, $1, 'active', NULL, NULL
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
                  new_travel.start_date::text,
                  new_travel.end_date::text,
                  new_travel.country_code,
                  new_travel.country_name_kr,
                  new_travel.base_currency,
                  new_travel.base_exchange_rate,
                  travel_invite.invite_code,
                  new_travel.status,
                  new_travel.created_at::text
           FROM new_travel, travel_invite`,
          [
            currentUser.id,
            payload.title,
            payload.startDate,
            payload.endDate,
            payload.countryCode,
            payload.countryNameKr,
            payload.baseCurrency,
            payload.baseExchangeRate,
            inviteCode,
          ]
        );

        const travelRow = insertResult.rows[0];

        const optimizedResult = {
          ...travelRow,
          owner_name: ownerName,
          members: [
            {
              userId: currentUser.id,
              name: ownerName,
              role: 'owner'
            }
          ]
        };

        const duration = Date.now() - startTime;
        this.logger.debug(`Travel created in ${duration}ms for user ${currentUser.id}`);

        await this.ensureCountryCurrencyMap();
        return this.mapSummary(optimizedResult, optimizedResult.members);
      });

      // 캐시 업데이트/무효화 (응답을 기다리지 않음)
      this.invalidateUserTravelCache(currentUser.id);
      this.setCachedTravelDetail(travel.id, travel);

      return travel;
    } catch (error) {
      this.logger.error('Failed to create travel', error as Error);
      throw new InternalServerErrorException('여행 생성에 실패했습니다.');
    }
  }

  async listTravels(
    userId: string,
    pagination: { page?: number; limit?: number; status?: 'active' | 'archived' } = {},
  ): Promise<{ total: number; page: number; limit: number; items: TravelSummary[] }> {
    await this.ensureCountryCurrencyMap();

    const pool = await getPool();
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

    const totalPromise = pool.query(
      `SELECT COUNT(*)::int AS total
       FROM travel_members tm
       INNER JOIN travels t ON t.id = tm.travel_id
       WHERE tm.user_id = $1
       ${statusCondition}`,
      [userId],
    );

    const listPromise = pool.query(
      `SELECT
         ut.id::text AS id,
         ut.title,
         ut.start_date::text,
         ut.end_date::text,
         ut.country_code,
         ut.country_name_kr,
         ut.base_currency,
         ut.base_exchange_rate,
         ti.invite_code,
         ut.computed_status AS status,
         ut.role,
         ut.created_at::text,
         owner_profile.name AS owner_name
       FROM (
          SELECT t.*, COALESCE(tm.role, mp.role, 'member') AS role,
                 CASE WHEN t.end_date < CURRENT_DATE THEN 'archived' ELSE 'active' END AS computed_status
          FROM travels t
          INNER JOIN travel_members tm ON tm.travel_id = t.id AND tm.user_id = $1
          LEFT JOIN profiles mp ON mp.id = tm.user_id
          WHERE 1 = 1
          ${statusCondition}
        ) AS ut
        INNER JOIN profiles owner_profile ON owner_profile.id = ut.owner_id
        LEFT JOIN travel_invites ti ON ti.travel_id = ut.id AND ti.status = 'active'
       ORDER BY ut.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );

    const [totalResult, listResult] = await Promise.all([totalPromise, listPromise]);
    const total = totalResult.rows[0]?.total ?? 0;
    const travelIds = listResult.rows.map((row) => row.id);
    const membersMap = await this.loadMembersForTravels(travelIds, userId);
    const items = listResult.rows.map((row) => this.mapSummary(row, membersMap.get(row.id)));

    // 캐시에 저장 (Redis + 메모리) - 딥링크 없이 저장
    this.setCachedTravelList(cacheKey, items);

    return {
      total,
      page,
      limit,
      items: items.map(item => this.attachLinks(item)),
    };
  }

  private generateInviteCode(): string {
    return randomBytes(5).toString('hex');
  }

  private generateDeepLink(inviteCode: string): string {
    // 카카오톡 공유용으로 웹 URL 형식 사용
    const base = (env.appBaseUrl || '').replace(/\/$/, '') || 'https://sseudam.up.railway.app';
    return `${base}/deeplink?inviteCode=${encodeURIComponent(inviteCode)}`;
  }


  async createInvite(travelId: string, userId: string): Promise<TravelInvitePayload> {
    const pool = await getPool();
    await this.ensureOwner(travelId, userId, pool);

    const travelStatusResult = await pool.query(
      `SELECT CASE WHEN end_date < CURRENT_DATE THEN 'archived' ELSE 'active' END AS travel_status
       FROM travels
       WHERE id = $1
       LIMIT 1`,
      [travelId],
    );
    const travelStatus = travelStatusResult.rows[0]?.travel_status;
    if (!travelStatus) {
      throw new NotFoundException('여행을 찾을 수 없습니다.');
    }

    // 기존 초대 코드가 있는지 확인
    const existingInvite = await pool.query(
      `SELECT invite_code FROM travel_invites WHERE travel_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
      [travelId]
    );

    let inviteCode = existingInvite.rows[0]?.invite_code;

    // 없다면 새로 생성
    if (!inviteCode) {
      inviteCode = this.generateInviteCode();
      await pool.query(
        `INSERT INTO travel_invites (travel_id, invite_code, created_by, status, expires_at, max_uses)
         VALUES ($1, $2, $3, 'active', NULL, NULL)
         ON CONFLICT (invite_code) DO UPDATE SET status = 'active',
                                                used_count = 0,
                                                expires_at = NULL,
                                                max_uses = NULL`,
        [travelId, inviteCode, userId]
      );
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

  private attachLinks(travel: TravelSummary): TravelSummary {
    if (!travel.inviteCode) return travel;
    return {
      ...travel,
      deepLink: this.generateDeepLink(travel.inviteCode),
    };
  }

  async deleteTravel(travelId: string, userId: string): Promise<void> {
    const pool = await getPool();
    await this.ensureOwner(travelId, userId, pool);

    const members = await pool.query(
      `SELECT user_id FROM travel_members WHERE travel_id = $1`,
      [travelId]
    );

    await this.ensureTransaction(async (client) => {
      await client.query(
        `WITH expense_ids AS (
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
         DELETE FROM travels WHERE id = $1`,
        [travelId],
      );
    });

    // 초대 코드 캐시 전부 무효화 (travelId별 키가 없으므로 패턴 삭제)
    this.cacheService.delPattern(`${this.INVITE_REDIS_PREFIX}:*`).catch(() => undefined);

    // 관련 캐시 무효화
    this.invalidateTravelDetailCache(travelId);
    members.rows.forEach(member => this.invalidateUserTravelCache(member.user_id));
    await this.invalidateMembersCacheForTravel(travelId);
  }

  async transferOwnership(travelId: string, currentOwnerId: string, newOwnerId: string): Promise<TravelSummary> {
    const pool = await getPool();
    await this.ensureOwner(travelId, currentOwnerId, pool);
    if (currentOwnerId === newOwnerId) {
      throw new BadRequestException('이미 호스트입니다.');
    }

    await this.ensureTransaction(async (client) => {
      const travelRow = await client.query(
        `SELECT owner_id FROM travels WHERE id = $1 LIMIT 1`,
        [travelId],
      );
      if (!travelRow.rows[0]) {
        throw new NotFoundException('여행을 찾을 수 없습니다.');
      }

      const memberRow = await client.query(
        `SELECT 1 FROM travel_members WHERE travel_id = $1 AND user_id = $2 LIMIT 1`,
        [travelId, newOwnerId],
      );
      if (!memberRow.rows[0]) {
        throw new BadRequestException('새 호스트가 여행 멤버가 아닙니다.');
      }

      // 기존 호스트를 멤버로, 새 호스트를 owner로 설정하고 travels.owner_id 업데이트
      const demoteResult = await client.query(
        `UPDATE travel_members
         SET role = 'member'
         WHERE travel_id = $1 AND user_id = $2`,
        [travelId, currentOwnerId],
      );
      if ((demoteResult.rowCount ?? 0) === 0) {
        throw new BadRequestException('현재 호스트를 멤버로 변경하지 못했습니다.');
      }

      const promoteResult = await client.query(
        `UPDATE travel_members
         SET role = 'owner'
         WHERE travel_id = $1 AND user_id = $2`,
        [travelId, newOwnerId],
      );
      if ((promoteResult.rowCount ?? 0) === 0) {
        throw new BadRequestException('새 호스트를 설정하지 못했습니다.');
      }

      await client.query(
        `UPDATE travels
         SET owner_id = $2
         WHERE id = $1`,
        [travelId, newOwnerId],
      );
    });

    // 트랜잭션 커밋 후 최신 상태 조회
    const summary = await this.fetchSummaryForMember(travelId, newOwnerId);

    // 캐시 무효화 및 최신 상세 캐시 저장
    this.invalidateTravelDetailCache(travelId);
    this.setCachedTravelDetail(travelId, summary);

    // 모든 멤버의 리스트 캐시 무효화
    const members = await pool.query(
      `SELECT user_id FROM travel_members WHERE travel_id = $1`,
      [travelId]
    );
    members.rows.forEach(member => this.invalidateUserTravelCache(member.user_id));

    return summary;
  }

  async joinByInviteCode(userId: string, inviteCode: string): Promise<TravelSummary> {
    const pool = await getPool();
    let inviteRow = await this.getCachedInvite(inviteCode);
    let fetchedFromCache = !!inviteRow;

    if (!inviteRow) {
      const inviteResult = await pool.query(
        `SELECT ti.travel_id,
                ti.status,
                ti.used_count,
                ti.max_uses,
                ti.expires_at,
                CASE WHEN t.end_date < CURRENT_DATE THEN 'archived' ELSE 'active' END AS travel_status
         FROM travel_invites ti
         INNER JOIN travels t ON t.id = ti.travel_id
         WHERE ti.invite_code = $1
         ORDER BY ti.created_at DESC
         LIMIT 1`,
        [inviteCode],
      );
      inviteRow = inviteResult.rows[0];
      if (!inviteRow) {
        throw new NotFoundException('유효하지 않은 초대 코드입니다.');
      }
      await this.setCachedInvite(inviteCode, inviteRow);
      fetchedFromCache = false;
    }

    // 캐시된 데이터 신뢰 (TTL을 짧게 유지하여 신뢰성 확보)
    // 기존 중복 쿼리 제거로 성능 개선
    if (inviteRow.status !== 'active' || inviteRow.travel_status !== 'active') {
      throw new BadRequestException('만료되었거나 비활성화된 초대 코드입니다.');
    }
    if (inviteRow.max_uses && inviteRow.used_count >= inviteRow.max_uses) {
      throw new BadRequestException('모집 인원을 초과한 초대 코드입니다.');
    }

    if (await this.isMember(inviteRow.travel_id, userId, pool)) {
      throw new BadRequestException('이미 참여 중인 여행입니다.');
    }

    await this.ensureTransaction(async (client) => {
      await client.query(
        `INSERT INTO travel_members (travel_id, user_id, role)
         VALUES ($1, $2, 'member')
         ON CONFLICT (travel_id, user_id) DO NOTHING`,
        [inviteRow.travel_id, userId],
      );

      await client.query(
        `UPDATE travel_invites
         SET used_count = used_count + 1
         WHERE invite_code = $1`,
        [inviteCode],
      );

      // 초대 코드로 참여하면 프로필 역할을 member로 설정 (user인 경우만)
      await client.query(
        `UPDATE profiles
         SET role = 'member'
         WHERE id = $1
           AND role = 'user'`,
        [userId],
      );
    });

    // 초대 코드 캐시 무효화
    this.invalidateInvite(inviteCode);

    // 새 멤버 참여 후 캐시 무효화
    this.invalidateUserTravelCache(userId);
    this.invalidateTravelDetailCache(inviteRow.travel_id);

    // 기존 멤버들의 여행 목록 캐시도 무효화 (멤버 정보가 변경되므로)
    await this.invalidateTravelCachesForMembers(inviteRow.travel_id);
    await this.invalidateMembersCacheForTravel(inviteRow.travel_id);

    // 멤버 포함 최신 상세를 즉시 조회해 캐시에 반영 (join 직후 멤버 목록 비어있는 문제 방지)
    const travelSummary = this.attachLinks(await this.fetchSummaryForMember(inviteRow.travel_id, userId, true));

    this.setCachedTravelDetail(inviteRow.travel_id, travelSummary);

    return this.reorderMembersForUser(travelSummary, userId);
  }

  async leaveTravel(travelId: string, userId: string): Promise<{ deletedTravel: boolean }> {
    const pool = await getPool();
    const membership = await pool.query(
      `SELECT tm.role, t.owner_id,
              (SELECT COUNT(*)::int FROM travel_members WHERE travel_id = $1) AS member_count
       FROM travel_members tm
       INNER JOIN travels t ON t.id = tm.travel_id
       WHERE tm.travel_id = $1 AND tm.user_id = $2
       LIMIT 1`,
      [travelId, userId],
    );

    const row = membership.rows[0];
    if (!row) {
      throw new NotFoundException('여행을 찾을 수 없거나 멤버가 아닙니다.');
    }

    // 소유자(owner)는 여행을 나갈 수 없음
    if (row.role === 'owner' || row.owner_id === userId) {
      throw new ForbiddenException('여행 호스트는 나갈 수 없습니다. 다른 멤버에게 호스트 권한을 위임하거나 여행을 삭제해주세요.');
    }

    // 일반 멤버 탈퇴: 멤버만 제거, 데이터 유지
    await pool.query(
      `DELETE FROM travel_members WHERE travel_id = $1 AND user_id = $2`,
      [travelId, userId],
    );

    // 멤버 탈퇴 후 관련 캐시 무효화
    this.invalidateUserTravelCache(userId);
    this.invalidateTravelDetailCache(travelId);

    return { deletedTravel: false };
  }

  async updateTravel(
    travelId: string,
    userId: string,
    payload: CreateTravelInput,
  ): Promise<TravelSummary> {
    const pool = await getPool();
    const result = await pool.query(
      `UPDATE travels
       SET title = $3,
           start_date = $4,
           end_date = $5,
           country_code = $6,
           country_name_kr = $7,
           base_currency = $8,
           base_exchange_rate = $9,
           status = CASE WHEN $5 < CURRENT_DATE THEN 'archived' ELSE 'active' END,
           updated_at = NOW()
       WHERE id = $1 AND owner_id = $2
       RETURNING
         id::text AS id,
         title,
         start_date::text,
         end_date::text,
         country_code,
         country_name_kr,
         base_currency,
         base_exchange_rate,
         invite_code,
         status,
         created_at::text`,
      [
        travelId,
        userId,
        payload.title,
        payload.startDate,
        payload.endDate,
        payload.countryCode,
        payload.countryNameKr,
        payload.baseCurrency,
        payload.baseExchangeRate,
      ],
    );
    const travelRow = result.rows[0];
    if (!travelRow) {
      const exists = await pool.query(`SELECT 1 FROM travels WHERE id = $1 LIMIT 1`, [travelId]);
      if (!exists.rows[0]) {
        throw new NotFoundException('여행을 찾을 수 없습니다.');
      }
      throw new ForbiddenException('여행 수정 권한이 없습니다.');
    }

    // 수정 후 관련 캐시 무효화
    this.invalidateTravelDetailCache(travelId);

    // 여행에 참여한 모든 멤버의 목록 캐시도 무효화
    await this.invalidateTravelCachesForMembers(travelId);

    const summary = await this.fetchSummaryForMember(travelId, userId);
    this.setCachedTravelDetail(travelId, summary);
    return summary;
  }

  async removeMember(travelId: string, ownerId: string, memberId: string): Promise<void> {
    const pool = await getPool();
    await this.ensureOwner(travelId, ownerId, pool);
    if (ownerId === memberId) {
      throw new BadRequestException('호스트는 스스로를 삭제할 수 없습니다.');
    }

    await pool.query(
      `DELETE FROM travel_members WHERE travel_id = $1 AND user_id = $2`,
      [travelId, memberId],
    );

    // 멤버 삭제 후 캐시 무효화
    this.invalidateUserTravelCache(memberId);
    this.invalidateTravelDetailCache(travelId);

    // 다른 멤버들의 여행 목록 캐시도 무효화 (멤버 정보가 변경되므로)
    await this.invalidateTravelCachesForMembers(travelId);
    await this.invalidateMembersCacheForTravel(travelId);
  }
}
