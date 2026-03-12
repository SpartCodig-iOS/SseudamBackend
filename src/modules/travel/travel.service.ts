import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomBytes } from 'crypto';
import { CreateTravelInput } from './schemas/travel.schemas';
import { UserRecord } from '../user/types/user.types';
import { MetaService } from '../meta/meta.service';
import { CacheService } from '../../common/services/cache.service';
import { AdaptiveCacheService } from '../../common/services/adaptive-cache.service';
import { PushNotificationService } from '../notification/services/push-notification.service';
import { ProfileService } from '../profile/profile.service';
import { env } from '../../config/env';
import { QueueEventService } from '../queue/services/queue-event.service';
import { AppMetricsService } from '../../common/metrics/app-metrics.service';
import { Travel } from './entities/travel.entity';
import { TravelMember } from './entities/travel-member.entity';
import { User } from '../user/entities/user.entity';

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
  countryCurrencies: string[];
  budget?: number; // 예산 (minor units, 예: 센트, 원)
  budgetCurrency?: string; // 예산 통화 (ISO 4217)
  inviteCode?: string;
  deepLink?: string;
  status: string;
  createdAt: string;
  ownerName: string | null;
  members?: TravelMemberInfo[];
}

export interface TravelDetail extends TravelSummary {}

export interface TravelInvitePayload {
  inviteCode: string;
  deepLink: string;
}

export interface TravelMemberInfo {
  userId: string;
  name: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  role: string;
}

@Injectable()
export class TravelService {
  private readonly logger = new Logger(TravelService.name);
  private readonly countryCurrencyCache = new Map<string, string>();
  private countryCurrencyLoaded = false;
  private countryCurrencyLoadPromise: Promise<void> | null = null;

  /**
   * 여행 목록/상세/멤버 인메모리 캐시: AdaptiveCacheService(LRU) 위임.
   * 기존 Map 기반 캐시는 제거되었으며, 메모리 상한과 LRU 정책이 자동 적용됩니다.
   */
  private readonly TRAVEL_LIST_CACHE_TTL = 30 * 1000; // 30초 (ms, 하위 호환)
  private readonly MAX_CACHE_SIZE = 1000; // 하위 호환 상수 (AdaptiveCacheService 내부에서 관리)

  // 여행 상세 캐시 TTL (하위 호환)
  private readonly TRAVEL_DETAIL_CACHE_TTL = 30 * 1000;
  private readonly TRAVEL_LIST_REDIS_PREFIX = 'travel:list';
  private readonly TRAVEL_DETAIL_REDIS_PREFIX = 'travel:detail';
  private readonly INVITE_REDIS_PREFIX = 'invite:code';
  private readonly INVITE_TTL_SECONDS = 5 * 60;
  private readonly TRAVEL_MEMBER_CACHE = new Map<string, { exists: boolean; expiresAt: number }>();
  private readonly TRAVEL_MEMBER_TTL = 2 * 60 * 1000; // 2분
  private readonly TRAVEL_MEMBER_REDIS_PREFIX = 'travel:member';
  private readonly TRAVEL_MEMBER_REDIS_TTL = 2 * 60; // 2분
  private readonly MEMBER_LIST_REDIS_PREFIX = 'travel:members';
  private readonly MEMBER_LIST_REDIS_TTL = 30; // 30초

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly metaService: MetaService,
    private readonly cacheService: CacheService,
    private readonly adaptiveCacheService: AdaptiveCacheService,
    private readonly eventEmitter: EventEmitter2,
    private readonly pushNotificationService: PushNotificationService,
    private readonly profileService: ProfileService,
    private readonly queueEventService: QueueEventService,
    private readonly metricsService: AppMetricsService,
  ) {}

  private emitTravelMembershipChanged(travelId: string): void {
    try {
      this.eventEmitter.emit('travel.membership_changed', { travelId });
    } catch (error) {
      this.logger.warn('Failed to emit travel.membership_changed', { travelId, error: (error as Error)?.message });
    }
  }

  /**
   * 🚀 멤버 아바타 빠른 로딩 최적화
   */
  private async optimizeMemberAvatars(membersMap: Map<string, TravelMemberInfo[]>): Promise<void> {
    try {
      const allMembers: TravelMemberInfo[] = [];
      for (const memberList of membersMap.values()) {
        allMembers.push(...memberList);
      }

      // 아바타가 없는 멤버들만 필터링
      const membersNeedingAvatars = allMembers.filter(member => !member.avatarUrl);

      if (membersNeedingAvatars.length === 0) {
        return;
      }

      // 병렬로 썸네일 아바타 빠른 조회 (50ms 초단축 타임아웃)
      const avatarPromises = membersNeedingAvatars.map(async (member) => {
        if (!member.userId) return;
        try {
          const thumbnailUrl = await this.profileService.fetchAvatarWithTimeout(member.userId, 50);
          if (thumbnailUrl) {
            member.avatarUrl = thumbnailUrl;
          } else {
            // 실패시 백그라운드 워밍
            void this.profileService.warmAvatarFromStorage(member.userId);
          }
        } catch {
          // 타임아웃이나 오류 시 백그라운드 워밍만 수행
          void this.profileService.warmAvatarFromStorage(member.userId);
        }
      });

      // 모든 아바타 조회를 병렬로 처리 (최대 50ms 대기)
      await Promise.allSettled(avatarPromises);

    } catch (error) {
      this.logger.warn('Avatar optimization failed:', error);
      // 실패해도 멤버 조회는 정상 진행
    }
  }

  /**
   * 여행 목록 캐시 조회 (AdaptiveCacheService LRU 위임).
   * 기존 Map 기반 무제한 증가 문제를 해결합니다.
   */
  private async getCachedTravelList(key: string, rawKey = false): Promise<TravelSummary[] | null> {
    const cacheKey = rawKey ? key : key;

    // AdaptiveCacheService L1(LRU) → L2(Redis) 순으로 조회
    try {
      const entry = await this.adaptiveCacheService.get<TravelSummary[] | null>(
        `travel_list:${cacheKey}`,
        async () => {
          // L2 Redis 체크
          const redisData = await this.cacheService.get<TravelSummary[]>(cacheKey, {
            prefix: this.TRAVEL_LIST_REDIS_PREFIX,
          });
          return redisData ?? null;
        },
        {
          baseTtl: Math.floor(this.TRAVEL_LIST_CACHE_TTL / 1000),
          maxTtlMultiplier: 2,
          tags: ['travel_list'],
        },
      );
      return entry;
    } catch (error) {
      this.logger.warn(`[Travel] getCachedTravelList failed for ${cacheKey}:`, error);
      return null;
    }
  }

  private setCachedTravelList(key: string, travels: TravelSummary[], rawKey = false): void {
    const cacheKey = rawKey ? key : key;
    const ttlSeconds = Math.floor(this.TRAVEL_LIST_CACHE_TTL / 1000);

    // AdaptiveCacheService에 저장 (내부에서 Redis L2도 자동 저장)
    this.adaptiveCacheService
      .get<TravelSummary[]>(
        `travel_list:${cacheKey}`,
        async () => travels,
        { baseTtl: ttlSeconds, maxTtlMultiplier: 2, tags: ['travel_list'] },
      )
      .catch(() => undefined);

    // Redis에도 직접 저장 (다른 프로세스와의 호환성)
    this.cacheService
      .set(cacheKey, travels, {
        prefix: this.TRAVEL_LIST_REDIS_PREFIX,
        ttl: ttlSeconds,
      })
      .catch(() => undefined);
  }

  /**
   * 여행 상세 캐시 조회 (AdaptiveCacheService LRU 위임).
   */
  private async getCachedTravelDetail(travelId: string): Promise<TravelDetail | null> {
    try {
      const entry = await this.adaptiveCacheService.get<TravelDetail | null>(
        `travel_detail:${travelId}`,
        async () => {
          const redisData = await this.cacheService.get<TravelDetail>(travelId, {
            prefix: this.TRAVEL_DETAIL_REDIS_PREFIX,
          });
          return redisData ?? null;
        },
        {
          baseTtl: Math.floor(this.TRAVEL_DETAIL_CACHE_TTL / 1000),
          maxTtlMultiplier: 3,
          tags: [`travel:${travelId}`],
        },
      );
      return entry;
    } catch (error) {
      this.logger.warn(`[Travel] getCachedTravelDetail failed for ${travelId}:`, error);
      return null;
    }
  }

  private setCachedTravelDetail(travelId: string, travel: TravelDetail): void {
    const ttlSeconds = Math.floor(this.TRAVEL_DETAIL_CACHE_TTL / 1000);

    // AdaptiveCacheService에 저장 (LRU + Redis)
    this.adaptiveCacheService
      .get<TravelDetail>(
        `travel_detail:${travelId}`,
        async () => travel,
        { baseTtl: ttlSeconds, maxTtlMultiplier: 3, tags: [`travel:${travelId}`] },
      )
      .catch(() => undefined);

    this.cacheService
      .set(travelId, travel, {
        prefix: this.TRAVEL_DETAIL_REDIS_PREFIX,
        ttl: ttlSeconds,
      })
      .catch(() => undefined);

    // 멤버십 캐시도 함께 갱신해 상세 조회 시 DB 조회를 줄임
    travel.members?.forEach((member) => {
      if (member.userId) {
        this.setMemberCache(travelId, member.userId, true);
      }
    });
  }

  private invalidateUserTravelCache(userId: string): void {
    // AdaptiveCacheService 태그 기반 무효화
    this.adaptiveCacheService.invalidateByTag(`user:${userId}`).catch(() => undefined);
    this.adaptiveCacheService.invalidateByTag('travel_list').catch(() => undefined);

    // Redis 캐시 패턴 삭제 (다른 프로세스 호환)
    this.cacheService.delPattern(`${this.TRAVEL_LIST_REDIS_PREFIX}:${userId}:*`).catch(() => undefined);
    this.cacheService.delPattern(`user_travels:${userId}:*`).catch(() => undefined);
  }

  private invalidateTravelDetailCache(travelId: string): void {
    // AdaptiveCacheService LRU에서 제거
    this.adaptiveCacheService.del(`travel_detail:${travelId}`).catch(() => undefined);
    this.adaptiveCacheService.invalidateByTag(`travel:${travelId}`).catch(() => undefined);

    // Redis에서도 제거 (하위 호환)
    this.cacheService.del(travelId, { prefix: this.TRAVEL_DETAIL_REDIS_PREFIX }).catch(() => undefined);
    this.cacheService.del(`travel_detail:${travelId}`).catch(() => undefined);
  }

  private async invalidateTravelCachesForMembers(travelId: string): Promise<void> {
    // TypeORM으로 여행 멤버 조회
    const memberRepository = this.dataSource.getRepository('TravelMember');
    const members = await memberRepository.find({
      where: { travelId },
      select: ['userId']
    });

    // 각 멤버의 여행 목록 캐시 무효화 (Redis 패턴 삭제)
    const memberIds = members.map((row: any) => row.user_id);
    await Promise.all(
      memberIds.map((userId: string) =>
        Promise.all([
          this.cacheService.delPattern(`${this.TRAVEL_LIST_REDIS_PREFIX}:${userId}:*`).catch(() => undefined),
          this.cacheService.delPattern(`user_travels:${userId}:*`).catch(() => undefined),
        ])
      )
    );

    // 메모리 캐시도 개별 무효화
    memberIds.forEach((userId: string) => this.invalidateUserTravelCache(userId));
  }

  private async getCachedInvite(inviteCode: string): Promise<{ travel_id: string; status: string; used_count: number; max_uses: number | null; expires_at: string | null; travel_status: string } | null> {
    try {
      return await this.cacheService.get(inviteCode, { prefix: this.INVITE_REDIS_PREFIX });
    } catch {
      return null;
    }
  }

  // 요청자 기준으로 멤버 배열을 재정렬 (요청자 우선)
  private reorderMembersForUser<T extends { members?: TravelMemberInfo[] }>(travel: T, userId: string): T {
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

  private async recordCurrencySnapshot(
    manager: EntityManager,
    params: {
      travelId: string;
      countryCode: string;
      baseCurrency: string;
      baseExchangeRate: number;
      baseAmount?: number;
    },
  ): Promise<void> {
    await this.ensureCountryCurrencyMap();
    const destinationCurrency = this.resolveDestinationCurrency(params.countryCode, params.baseCurrency);
    const baseAmount = params.baseAmount ?? 1000;

    await manager.query(
      `INSERT INTO travel_currency_snapshots
         (travel_id, base_currency, destination_currency, base_amount, base_exchange_rate)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        params.travelId,
        params.baseCurrency.toUpperCase(),
        destinationCurrency,
        baseAmount,
        params.baseExchangeRate,
      ],
    );
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
      // ignore cache error
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
    await this.cacheService.del(travelId, { prefix: this.MEMBER_LIST_REDIS_PREFIX }).catch(() => undefined);
  }

  private setMemberListCache(travelId: string, members: TravelMemberInfo[]): void {
    this.cacheService.set(travelId, members, {
      prefix: this.MEMBER_LIST_REDIS_PREFIX,
      ttl: this.MEMBER_LIST_REDIS_TTL,
    }).catch(() => undefined);
  }

  private async loadMembersForTravels(travelIds: string[], requesterId: string): Promise<Map<string, TravelMemberInfo[]>> {
    const membersMap = new Map<string, TravelMemberInfo[]>();
    if (travelIds.length === 0) {
      return membersMap;
    }

    let cachedLists: (TravelMemberInfo[] | null)[] = [];
    try {
      cachedLists = await this.cacheService.mget<TravelMemberInfo[]>(travelIds, { prefix: this.MEMBER_LIST_REDIS_PREFIX });
    } catch {
      // ignore cache errors
    }

    const missingTravelIds: string[] = [];
    travelIds.forEach((id, idx) => {
      const cached = cachedLists[idx];
      if (cached && Array.isArray(cached)) {
        membersMap.set(id, cached);
      } else {
        missingTravelIds.push(id);
      }
    });

    if (missingTravelIds.length > 0) {
      const rows = await this.dataSource
        .createQueryBuilder()
        .select([
          'tm.travel_id AS travel_id',
          'tm.user_id AS user_id',
          'tm.role AS role',
          'COALESCE(tm.display_name, p.name) AS name',
          'p.email AS email',
          'p.avatar_url AS avatar_url',
          'tm.joined_at AS joined_at'
        ])
        .from(TravelMember, 'tm')
        .leftJoin(User, 'p', 'p.id = tm.user_id')
        .where('tm.travel_id IN (:...travelIds)', { travelIds: missingTravelIds })
        .orderBy('tm.travel_id')
        .addOrderBy('CASE WHEN tm.user_id = :requesterId THEN 0 ELSE 1 END', 'ASC')
        .addOrderBy('tm.joined_at')
        .setParameter('requesterId', requesterId)
        .getRawMany();

      for (const row of rows) {
        const list = membersMap.get(row.travel_id) ?? [];
        list.push({
          userId: row.user_id,
          name: row.name ?? null,
          email: row.email ?? null,
          avatarUrl: row.avatar_url ?? null,
          role: row.role ?? 'member',
        } as TravelMemberInfo);
        membersMap.set(row.travel_id, list);
      }

      // 🚀 아바타 빠른 로딩 최적화
      await this.optimizeMemberAvatars(membersMap);

      const toCache = missingTravelIds
        .filter(id => membersMap.has(id))
        .map(id => ({ key: id, value: membersMap.get(id)! }));
      if (toCache.length > 0) {
        this.cacheService.mset(toCache, {
          prefix: this.MEMBER_LIST_REDIS_PREFIX,
          ttl: this.MEMBER_LIST_REDIS_TTL,
        }).catch(() => undefined);
      }
    }

    return membersMap;
  }

  private async ensureOwner(travelId: string, userId: string, executor?: any): Promise<void> {
    // TypeORM으로 여행 소유자 확인
    const travelRepository = executor?.getRepository
      ? executor.getRepository('Travel')
      : this.dataSource.getRepository('Travel');

    const travel = await travelRepository.findOne({
      where: { id: travelId },
      select: ['ownerId']
    });

    if (!travel) {
      throw new NotFoundException('여행을 찾을 수 없습니다.');
    }
    if (travel.ownerId !== userId) {
      throw new ForbiddenException('여행 호스트만 수행할 수 있는 작업입니다.');
    }
  }

  private async isMember(travelId: string, userId: string): Promise<boolean> {
    const cached = await this.isMemberCached(travelId, userId);
    if (cached !== null) return cached;

    // TypeORM count를 사용한 효율적인 멤버십 확인
    const memberRepository = this.dataSource.getRepository('TravelMember');
    const count = await memberRepository.count({
      where: { travelId, userId },
      take: 1 // 성능 최적화
    });

    const exists = count > 0;
    this.setMemberCache(travelId, userId, exists);
    return exists;
  }

  private async fetchSummaryForMember(travelId: string, userId: string, includeMembers: boolean = true): Promise<TravelSummary> {
    await this.ensureCountryCurrencyMap();

    // TypeORM QueryBuilder로 복합 JOIN 쿼리 실행
    const travelRepository = this.dataSource.getRepository('Travel');
    const result = await travelRepository
      .createQueryBuilder('t')
      .innerJoin('t.members', 'tm', 'tm.userId = :userId', { userId })
      .leftJoin('t.owner', 'owner_profile')
      .leftJoin('TravelInvite', 'ti', 'ti.travelId = t.id AND ti.status = :status', { status: 'active' })
      .select([
        't.id',
        't.title',
        't.startDate',
        't.endDate',
        't.countryCode',
        't.countryNameKr',
        't.countryCurrencies',
        't.baseCurrency',
        't.baseExchangeRate',
        't.budget',
        't.budgetCurrency',
        't.createdAt',
        'ti.inviteCode',
        'tm.role',
        'owner_profile.name'
      ])
      .addSelect("CASE WHEN t.endDate < CURRENT_DATE THEN 'archived' ELSE 'active' END", 'status')
      .where('t.id = :travelId', { travelId })
      .getRawOne();

    if (!result) {
      throw new NotFoundException('여행을 찾을 수 없거나 접근 권한이 없습니다.');
    }

    // 결과를 기존 형식에 맞게 변환
    const row = {
      id: result.t_id,
      title: result.t_title,
      start_date: result.t_startDate?.toISOString().split('T')[0],
      end_date: result.t_endDate?.toISOString().split('T')[0],
      country_code: result.t_countryCode,
      country_name_kr: result.t_countryNameKr,
      country_currencies: result.t_countryCurrencies,
      base_currency: result.t_baseCurrency,
      base_exchange_rate: result.t_baseExchangeRate,
      budget: result.t_budget,
      budget_currency: result.t_budgetCurrency,
      invite_code: result.ti_inviteCode,
      status: result.status,
      created_at: result.t_createdAt?.toISOString(),
      role: result.tm_role,
      owner_name: result.owner_profile_name
    };

    // join 시에는 멤버 정보 로드 스킵으로 성능 개선
    const members = includeMembers
      ? (await this.loadMembersForTravels([travelId], userId)).get(travelId)
      : [];

    return this.mapSummary(row, members);
  }

  private mapSummary(row: any, members?: TravelMemberInfo[]): TravelSummary {
    const destinationCurrency = this.resolveDestinationCurrency(row.country_code, row.base_currency);
    const inviteCode = row.invite_code ?? undefined;
    const deepLink = inviteCode ? this.generateDeepLink(inviteCode) : undefined;
    const sanitizeMembers = (list: any[] | undefined) =>
      list?.map((m: any) => ({
        userId: m.userId ?? m.user_id,
        name: m.name ?? null,
        role: m.role,
      }));
    const sanitizedMembers = sanitizeMembers(members) ?? sanitizeMembers(row.members);
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
      budget: row.budget ? Number(row.budget) : undefined,
      budgetCurrency: row.budget_currency ?? undefined,
      inviteCode,
      deepLink,
      status: row.status,
      createdAt: row.created_at,
      ownerName: row.owner_name ?? null,
      members: sanitizedMembers ?? row.members ?? undefined,
    };
  }

  async getTravelDetail(travelId: string, userId: string): Promise<TravelDetail> {
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
        throw new ForbiddenException('여행에 참여 중인 사용자만 조회할 수 있습니다.');
      }
      this.setMemberCache(travelId, userId, true);
      const hydrated = this.attachLinks(travelWithMembers);
      return this.reorderMembersForUser(hydrated, userId);
    }

    // 캐시에 없으면 DB에서 확인
    const member = await this.isMember(travelId, userId);
    if (!member) {
      throw new ForbiddenException('여행에 참여 중인 사용자만 조회할 수 있습니다.');
    }
    const travel = this.attachLinks(await this.fetchSummaryForMember(travelId, userId));
    this.setCachedTravelDetail(travelId, travel);
    if (travel.members) {
      this.setMemberListCache(travelId, travel.members);
    }
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

  private normalizeDate(input: string, fieldName: string): string {
    const pattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!input || !pattern.test(input)) {
      throw new BadRequestException(`${fieldName}는 YYYY-MM-DD 형식이어야 합니다.`);
    }
    const parsed = new Date(`${input}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`유효한 ${fieldName}가 아닙니다.`);
    }
    return input;
  }

  private async ensureTransaction<T>(callback: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      try {
        return await callback(manager);
      } catch (error) {
        this.logger.error('Transaction failed', error as Error);
        throw error;
      }
    });
  }

  async createTravel(currentUser: UserRecord, payload: CreateTravelInput): Promise<TravelDetail> {
    try {
      const startDate = this.normalizeDate(payload.startDate, 'startDate');
      const endDate = this.normalizeDate(payload.endDate, 'endDate');
      const travel = await this.ensureTransaction(async (manager) => {
        const startTime = Date.now();
        const ownerName = currentUser.name ?? currentUser.email ?? '알 수 없는 사용자';

        // inviteCode 자동 생성
        const inviteCode = this.generateInviteCode();

        // 1. 여행 생성
        const travelStatus = new Date(endDate) < new Date() ? 'archived' : 'active';
        const newTravel = await manager.save(Travel, {
          ownerId: currentUser.id,
          title: payload.title,
          startDate,
          endDate,
          countryCode: payload.countryCode,
          countryNameKr: payload.countryNameKr,
          baseCurrency: payload.baseCurrency,
          baseExchangeRate: payload.baseExchangeRate,
          countryCurrencies: payload.countryCurrencies,
          budget: payload.budget ?? null,
          budgetCurrency: payload.budgetCurrency ?? null,
          status: travelStatus as any,
        });

        // 2. 소유자를 멤버로 추가
        await manager.save(TravelMember, {
          travelId: newTravel.id,
          userId: currentUser.id,
          role: 'owner' as any,
        });

        // 3. 여행 초대 생성 (travel_invites 테이블이 있다면)
        try {
          await manager.query(
            `INSERT INTO travel_invites (travel_id, invite_code, created_by, status, expires_at, max_uses)
             VALUES ($1, $2, $3, 'active', NULL, NULL)
             ON CONFLICT (invite_code) DO UPDATE SET
               invite_code = excluded.invite_code,
               status = 'active',
               used_count = 0,
               expires_at = NULL,
               max_uses = NULL`,
            [newTravel.id, inviteCode, currentUser.id]
          );
        } catch (error) {
          this.logger.warn('Failed to create travel invite:', error);
        }

        // 4. 결과 포맷팅
        const insertResult = [{
          id: newTravel.id,
          title: newTravel.title,
          start_date: newTravel.startDate,
          end_date: newTravel.endDate,
          country_code: newTravel.countryCode,
          country_name_kr: newTravel.countryNameKr,
          base_currency: newTravel.baseCurrency,
          base_exchange_rate: newTravel.baseExchangeRate,
          country_currencies: newTravel.countryCurrencies,
          budget: newTravel.budget,
          budget_currency: newTravel.budgetCurrency,
          invite_code: inviteCode,
          status: newTravel.status,
          created_at: newTravel.createdAt.toISOString()
        }];

        const travelRow = insertResult[0];

        await this.recordCurrencySnapshot(manager, {
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

      // 🎯 백그라운드 이벤트 발송 (기존 동작에 영향 없음)
      this.queueEventService.emitTravelCreated({
        travelId: travel.id,
        title: travel.title,
        ownerId: currentUser.id,
        ownerName: currentUser.name ?? currentUser.email ?? '알 수 없는 사용자',
        memberIds: [currentUser.id], // 처음엔 생성자만
      }).catch(error => {
        // Queue 실패해도 API는 정상 응답
        this.logger.warn(`Failed to emit travel created event: ${error.message}`);
      });

      this.metricsService?.recordTravelCreated('success');
      return travel;
    } catch (error) {
      this.metricsService?.recordTravelCreated('error');
      this.logger.error('Failed to create travel', error as Error);
      throw new InternalServerErrorException('여행 생성에 실패했습니다.');
    }
  }

  async listTravels(
    userId: string,
    pagination: { page?: number; limit?: number; status?: 'active' | 'archived' } = {},
  ): Promise<{ total: number; page: number; limit: number; items: TravelSummary[] }> {
    await this.ensureCountryCurrencyMap();

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

    let subQueryBuilder = this.dataSource
      .createQueryBuilder()
      .select([
        't.*',
        'COALESCE(tm.role, \'member\') AS role',
        'CASE WHEN t.end_date < CURRENT_DATE THEN \'archived\' ELSE \'active\' END AS computed_status',
        'COUNT(*) OVER() AS total_count'
      ])
      .from(Travel, 't')
      .innerJoin(TravelMember, 'tm', 't.id = tm.travel_id AND tm.user_id = :userId', { userId })
      .orderBy('t.created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    // 상태 조건 추가
    if (pagination.status === 'active') {
      subQueryBuilder = subQueryBuilder.andWhere('t.end_date >= CURRENT_DATE');
    } else if (pagination.status === 'archived') {
      subQueryBuilder = subQueryBuilder.andWhere('t.end_date < CURRENT_DATE');
    }

    const listRows = await this.dataSource
      .createQueryBuilder()
      .select([
        'ut.id AS id',
        'ut.title AS title',
        `to_char(ut.start_date::date, 'YYYY-MM-DD') AS start_date`,
        `to_char(ut.end_date::date, 'YYYY-MM-DD') AS end_date`,
        'ut.country_code AS country_code',
        'ut.country_name_kr AS country_name_kr',
        'ut.country_currencies AS country_currencies',
        'ut.base_currency AS base_currency',
        'ut.base_exchange_rate AS base_exchange_rate',
        'ti.invite_code AS invite_code',
        'ut.computed_status AS status',
        'ut.role AS role',
        'ut.created_at AS created_at',
        'owner_profile.name AS owner_name',
        'ut.total_count AS total_count'
      ])
      .from(`(${subQueryBuilder.getQuery()})`, 'ut')
      .innerJoin(User, 'owner_profile', 'owner_profile.id = ut.owner_id')
      .leftJoin(
        '(SELECT travel_id, invite_code FROM travel_invites WHERE status = \'active\')',
        'ti',
        'ti.travel_id = ut.id'
      )
      .setParameters(subQueryBuilder.getParameters())
      .getRawMany();

    const total = Number(listRows[0]?.total_count ?? 0);
    // 동일 travel_id가 중복으로 내려오지 않도록 dedupe 후 멤버 로드
    const uniqueRows = Array.from(
      new Map(listRows.map((row: any) => [row.id, row])).values()
    );
    const travelIds = uniqueRows.map((row: any) => row.id);
    const membersMap = await this.loadMembersForTravels(travelIds, userId);
    const items = uniqueRows.map((row: any) => this.mapSummary(row, membersMap.get(row.id)));

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
    // 6자 영문/숫자 조합 초대 코드 (URL-safe)
    const charset = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += charset[bytes[i] % charset.length];
    }
    return code;
  }

  private generateDeepLink(inviteCode: string): string {
    // 카카오톡 공유용으로 웹 URL 형식 사용
    const base = (env.appBaseUrl || '').replace(/\/$/, '') || 'https://sseudam.up.railway.app';
    return `${base}/deeplink?inviteCode=${encodeURIComponent(inviteCode)}`;
  }


  async createInvite(travelId: string, userId: string): Promise<TravelInvitePayload> {
    await this.ensureOwner(travelId, userId);

    const travelStatusResult = await this.dataSource
      .createQueryBuilder()
      .select('CASE WHEN t.end_date < CURRENT_DATE THEN \'archived\' ELSE \'active\' END', 'travel_status')
      .from(Travel, 't')
      .where('t.id = :travelId', { travelId })
      .getRawOne();
    const travelStatus = travelStatusResult?.travel_status;
    if (!travelStatus) {
      throw new NotFoundException('여행을 찾을 수 없습니다.');
    }

    // 기존 초대 코드가 있는지 확인
    const existingInviteResult = await this.dataSource.query(
      `SELECT invite_code FROM travel_invites WHERE travel_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
      [travelId]
    );

    let inviteCode = existingInviteResult[0]?.invite_code;

    // 없다면 새로 생성
    if (!inviteCode) {
      inviteCode = this.generateInviteCode();
      await this.dataSource.query(
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

  private async invalidateExpenseAndSettlementCaches(travelId: string): Promise<void> {
    await Promise.all([
      this.cacheService.delPattern(`expense:list:${travelId}:*`).catch(() => undefined),
      this.cacheService.delPattern(`expense:detail:${travelId}:*`).catch(() => undefined),
      this.cacheService.del(travelId, { prefix: 'expense:context' }).catch(() => undefined),
      this.cacheService.del(travelId, { prefix: 'settlement:summary' }).catch(() => undefined),
    ]);
  }

  async deleteTravel(travelId: string, userId: string): Promise<void> {
    await this.ensureOwner(travelId, userId);

    const members = await this.dataSource
      .getRepository(TravelMember)
      .find({
        where: { travelId },
        select: ['userId']
      });

    await this.ensureTransaction(async (manager) => {
      await manager.query(
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
    members.forEach((member: any) => this.invalidateUserTravelCache(member.userId));
    await this.invalidateMembersCacheForTravel(travelId);
  }

  async transferOwnership(travelId: string, currentOwnerId: string, newOwnerId: string): Promise<TravelSummary> {
    await this.ensureOwner(travelId, currentOwnerId);
    if (currentOwnerId === newOwnerId) {
      throw new BadRequestException('이미 호스트입니다.');
    }

    await this.ensureTransaction(async (manager) => {
      // 여행 존재 확인 (FOR UPDATE 락)
      const travel = await manager
        .createQueryBuilder()
        .select('travel.owner_id', 'owner_id')
        .from(Travel, 'travel')
        .where('travel.id = :travelId', { travelId })
        .setLock('pessimistic_write')
        .getRawOne();

      if (!travel) {
        throw new NotFoundException('여행을 찾을 수 없습니다.');
      }

      // 새 호스트가 멤버인지 확인
      const member = await manager
        .getRepository(TravelMember)
        .findOne({
          where: { travelId, userId: newOwnerId },
          select: ['id']
        });

      if (!member) {
        throw new BadRequestException('새 호스트가 여행 멤버가 아닙니다.');
      }

      // 기존 호스트를 멤버로 변경
      const demoteResult = await manager
        .getRepository(TravelMember)
        .update(
          { travelId, userId: currentOwnerId },
          { role: 'member' as any }
        );

      if (demoteResult.affected === 0) {
        throw new BadRequestException('현재 호스트를 멤버로 변경하지 못했습니다.');
      }

      // 새 호스트를 owner로 승격
      const promoteResult = await manager
        .getRepository(TravelMember)
        .update(
          { travelId, userId: newOwnerId },
          { role: 'owner' as any }
        );

      if (promoteResult.affected === 0) {
        throw new BadRequestException('새 호스트를 설정하지 못했습니다.');
      }

      // travels 테이블의 owner_id 업데이트
      await manager
        .getRepository(Travel)
        .update(
          { id: travelId },
          { ownerId: newOwnerId }
        );
    });

    // 멤버/권한 변경 직후 캐시를 비워 최신 멤버 목록을 강제로 조회
    await this.invalidateMembersCacheForTravel(travelId);

    // 트랜잭션 커밋 후 최신 상태 조회
    const summary = await this.fetchSummaryForMember(travelId, newOwnerId);

    // 캐시 무효화 및 최신 상세 캐시 저장
    this.invalidateTravelDetailCache(travelId);
    this.setCachedTravelDetail(travelId, summary);

    // 모든 멤버의 리스트 캐시 무효화
    const memberRows = await this.dataSource
      .getRepository(TravelMember)
      .find({
        where: { travelId },
        select: ['userId']
      });
    memberRows.forEach((member: any) => this.invalidateUserTravelCache(member.userId));

    return summary;
  }

  async joinByInviteCode(userId: string, inviteCode: string): Promise<TravelSummary> {
    let inviteRow = await this.getCachedInvite(inviteCode);
    let fetchedFromCache = !!inviteRow;

    if (!inviteRow) {
      const inviteResult = await this.dataSource.query(
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
      inviteRow = inviteResult[0];
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

    if (await this.isMember(inviteRow.travel_id, userId)) {
      throw new BadRequestException('이미 참여 중인 여행입니다.');
    }

    await this.ensureTransaction(async (manager) => {
      await manager.query(
        `INSERT INTO travel_members (travel_id, user_id, role)
         VALUES ($1, $2, 'member')
         ON CONFLICT (travel_id, user_id) DO NOTHING`,
        [inviteRow.travel_id, userId],
      );

      await manager.query(
        `UPDATE travel_invites
         SET used_count = used_count + 1
         WHERE invite_code = $1`,
        [inviteCode],
      );

      // 초대 코드로 참여하면 프로필 역할을 member로 설정 (user인 경우만)
      await manager
        .getRepository(User)
        .update(
          { id: userId, role: 'user' as any },
          { role: 'member' as any }
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

    // 멤버십 캐시 업데이트: 이후 상세 조회/권한 체크 시 DB 조회를 생략
    this.setMemberCache(inviteRow.travel_id, userId, true);

    // 멤버 포함 최신 상세를 즉시 조회해 캐시에 반영 (join 직후 멤버 목록 비어있는 문제 방지)
    const travelSummary = this.attachLinks(await this.fetchSummaryForMember(inviteRow.travel_id, userId, true));

    this.setCachedTravelDetail(inviteRow.travel_id, travelSummary);
    if (travelSummary.members) {
      this.setMemberListCache(inviteRow.travel_id, travelSummary.members);
    }

    // 여행 멤버 변경 이벤트 전파 (지출 컨텍스트 캐시 무효화 등)
    this.emitTravelMembershipChanged(inviteRow.travel_id);

    // 새 멤버 추가 알림 이벤트 발송
    if (travelSummary.members && travelSummary.members.length > 0) {
      const user = await this.dataSource
        .getRepository(User)
        .findOne({
          where: { id: userId },
          select: ['name']
        });
      const currentUserName = user?.name || '새 멤버';
      const memberIds = travelSummary.members.map(m => m.userId).filter(Boolean) as string[];

      await this.pushNotificationService.sendTravelNotification(
        'travel_member_added',
        inviteRow.travel_id,
        userId,
        currentUserName,
        travelSummary.title,
        memberIds
      );

      // 🎯 백그라운드 멤버 초대 이벤트 발송 (기존 동작에 영향 없음)
      this.queueEventService.emitMemberInvited({
        travelId: inviteRow.travel_id,
        travelTitle: travelSummary.title,
        invitedUserId: userId,
        invitedByUserId: travelSummary.members?.find(m => m.role === 'owner')?.userId || '',
        invitedByName: travelSummary.ownerName || '호스트',
        inviteCode: inviteCode,
      }).catch(error => {
        // Queue 실패해도 API는 정상 응답
        this.logger.warn(`Failed to emit member invited event: ${error.message}`);
      });
    }

    return this.reorderMembersForUser(travelSummary, userId);
  }

  async leaveTravel(travelId: string, userId: string): Promise<{ deletedTravel: boolean }> {
    let travelTitle = '';
    let memberIds: string[] = [];

    await this.dataSource.transaction(async (manager) => {
      const membership = await manager.query(
        `SELECT tm.role, t.owner_id, t.title,
                (SELECT COUNT(*)::int FROM travel_members WHERE travel_id = $1) AS member_count
         FROM travel_members tm
         INNER JOIN travels t ON t.id = tm.travel_id
         WHERE tm.travel_id = $1 AND tm.user_id = $2
         LIMIT 1
         FOR UPDATE`,
        [travelId, userId],
      );

      const row = membership[0];
      if (!row) {
        throw new NotFoundException('여행을 찾을 수 없거나 멤버가 아닙니다.');
      }

      travelTitle = row.title;

      // 소유자(owner)는 여행을 나갈 수 없음
      if (row.role === 'owner' || row.owner_id === userId) {
        throw new ForbiddenException('여행 호스트는 나갈 수 없습니다. 다른 멤버에게 호스트 권한을 위임하거나 여행을 삭제해주세요.');
      }

      // 알림 발송용 멤버 목록 조회 (나가기 전)
      const membersResult = await manager.query(
        `SELECT user_id FROM travel_members WHERE travel_id = $1`,
        [travelId]
      );
      memberIds = membersResult.map((m: any) => m.user_id);

      // 일반 멤버 탈퇴: 멤버만 제거, 데이터 유지
      await manager.query(
        `DELETE FROM travel_members WHERE travel_id = $1 AND user_id = $2`,
        [travelId, userId],
      );
    });

    // 멤버 탈퇴 후 관련 캐시 무효화
    this.invalidateUserTravelCache(userId);
    this.invalidateTravelDetailCache(travelId);
    await this.invalidateMemberCache(travelId, userId);
    // 다른 멤버들의 목록/멤버십 캐시도 무효화해 즉시 반영
    await this.invalidateTravelCachesForMembers(travelId);
    await this.invalidateMembersCacheForTravel(travelId);
    this.emitTravelMembershipChanged(travelId);

    // 멤버 나가기 알림 이벤트 발송
    const targetMemberIds = memberIds.filter(id => id !== userId);
    if (targetMemberIds.length > 0 && travelTitle) {
      const userNameRows = await this.dataSource.query(
        `SELECT name FROM profiles WHERE id = $1`,
        [userId]
      );
      const currentUserName = userNameRows[0]?.name || '멤버';

      await this.pushNotificationService.sendTravelNotification(
        'travel_member_removed',
        travelId,
        userId,
        currentUserName,
        travelTitle,
        targetMemberIds
      );
    }

    return { deletedTravel: false };
  }

  async updateTravel(
    travelId: string,
    userId: string,
    payload: CreateTravelInput,
  ): Promise<TravelSummary> {
    const travelRow = await this.ensureTransaction(async (manager) => {
      // 소유자 확인 + 행 잠금
      const ownerCheck = await manager.query(
        `SELECT 1 FROM travels WHERE id = $1 AND owner_id = $2 LIMIT 1 FOR UPDATE`,
        [travelId, userId],
      );
      if (!ownerCheck[0]) {
        const exists = await manager.query(`SELECT 1 FROM travels WHERE id = $1 LIMIT 1`, [travelId]);
        if (!exists[0]) {
          throw new NotFoundException('여행을 찾을 수 없습니다.');
        }
        throw new ForbiddenException('여행 수정 권한이 없습니다.');
      }

      const result = await manager.query(
        `UPDATE travels
         SET title = $3,
             start_date = to_date($4, 'YYYY-MM-DD'),
             end_date = to_date($5, 'YYYY-MM-DD'),
             country_code = $6,
             country_name_kr = $7,
             base_currency = $8,
             base_exchange_rate = $9,
             country_currencies = $10,
             budget = $11,
             budget_currency = $12,
             status = CASE WHEN to_date($5, 'YYYY-MM-DD') < CURRENT_DATE THEN 'archived' ELSE 'active' END,
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
           budget,
           budget_currency,
           invite_code,
           status,
           created_at::text`,
        [
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
          payload.budget ?? null,
          payload.budgetCurrency ?? null,
        ],
      );
      const row = Array.isArray(result) ? result[0] : result?.rows?.[0];
      if (row) {
        await this.recordCurrencySnapshot(manager, {
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

    // 강제 전체 캐시 클리어 (업데이트 직후 최신 반영 보장)
    this.logger.warn(`[CACHE-DEBUG] updateTravel: Forcing cache clear for travel ${travelId}, user ${userId}`);
    // AdaptiveCacheService 태그 기반 무효화 (travel_list 전체 + 해당 여행 상세)
    await this.adaptiveCacheService.invalidateByTags(['travel_list', `travel:${travelId}`]).catch(() => undefined);
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
      const userNameRows = await this.dataSource.query(
        `SELECT name FROM profiles WHERE id = $1`,
        [userId]
      );
      const currentUserName = userNameRows[0]?.name || '사용자';
      const memberIds = summary.members.map(m => m.userId).filter(Boolean) as string[];

      await this.pushNotificationService.sendTravelNotification(
        'travel_updated',
        travelId,
        userId,
        currentUserName,
        payload.title,
        memberIds
      );
    }

    return summary;
  }

  async removeMember(travelId: string, ownerId: string, memberId: string): Promise<void> {
    await this.ensureOwner(travelId, ownerId);
    if (ownerId === memberId) {
      throw new BadRequestException('호스트는 스스로를 삭제할 수 없습니다.');
    }

    let travelTitle = '';
    let memberIds: string[] = [];

    await this.dataSource.transaction(async (manager) => {
      // 여행 정보와 멤버 목록 조회 (삭제 전)
      const travelResult = await manager.query(
        `SELECT title FROM travels WHERE id = $1`,
        [travelId]
      );
      travelTitle = travelResult[0]?.title || '';

      const membersResult = await manager.query(
        `SELECT user_id FROM travel_members WHERE travel_id = $1`,
        [travelId]
      );
      memberIds = membersResult.map((m: any) => m.user_id);

      const target = await manager.query(
        `SELECT 1 FROM travel_members WHERE travel_id = $1 AND user_id = $2 FOR UPDATE`,
        [travelId, memberId],
      );
      if (!target[0]) {
        throw new NotFoundException('멤버를 찾을 수 없습니다.');
      }

      await manager.query(
        `DELETE FROM travel_members WHERE travel_id = $1 AND user_id = $2`,
        [travelId, memberId],
      );
    });

    // 멤버 삭제 후 캐시 무효화
    this.invalidateUserTravelCache(memberId);
    this.invalidateTravelDetailCache(travelId);
    await this.invalidateMemberCache(travelId, memberId);

    // 다른 멤버들의 여행 목록 캐시도 무효화 (멤버 정보가 변경되므로)
    await this.invalidateTravelCachesForMembers(travelId);
    await this.invalidateMembersCacheForTravel(travelId);
    this.emitTravelMembershipChanged(travelId);

    // 멤버 삭제 알림 이벤트 발송 (삭제된 멤버에게는 전송하지 않음)
    const targetMemberIds = memberIds.filter(id => id !== memberId);
    if (targetMemberIds.length > 0 && travelTitle) {
      const owner = await this.dataSource
        .getRepository(User)
        .findOne({
          where: { id: ownerId },
          select: ['name']
        });
      const ownerName = owner?.name || '호스트';

      await this.pushNotificationService.sendTravelNotification(
        'travel_member_removed',
        travelId,
        ownerId,
        ownerName,
        travelTitle,
        targetMemberIds
      );
    }
  }

  /**
   * 사용자가 참여 중인 모든 여행의 멤버 목록을 조회
   */
  async getTravelMembersForUser(userId: string): Promise<{ travelId: string; travelTitle: string; members: TravelMemberInfo[] }[]> {
    // 사용자가 참여 중인 여행 목록과 해당 여행의 모든 멤버 정보를 한 번에 조회
    const rows = await this.dataSource
      .createQueryBuilder()
      .select([
        't.id AS travel_id',
        't.title AS travel_title',
        'tm_all.user_id AS member_user_id',
        'tm_all.role AS member_role',
        'COALESCE(tm_all.display_name, p.name) AS member_name',
        'p.email AS member_email',
        'p.avatar_url AS member_avatar'
      ])
      .from(Travel, 't')
      .innerJoin(TravelMember, 'tm_user', 'tm_user.travel_id = t.id AND tm_user.user_id = :userId', { userId })
      .innerJoin(TravelMember, 'tm_all', 'tm_all.travel_id = t.id')
      .leftJoin(User, 'p', 'p.id = tm_all.user_id')
      .orderBy('t.title')
      .addOrderBy('CASE WHEN tm_all.role = \'owner\' THEN 0 ELSE 1 END')
      .addOrderBy('tm_all.joined_at')
      .getRawMany();

    // 결과를 여행별로 그룹화
    const travelMembersMap = new Map<string, { travelId: string; travelTitle: string; members: TravelMemberInfo[] }>();

    for (const row of rows) {
      const { travel_id, travel_title, member_user_id, member_role, member_name, member_email, member_avatar } = row;

      if (!travelMembersMap.has(travel_id)) {
        travelMembersMap.set(travel_id, {
          travelId: travel_id,
          travelTitle: travel_title,
          members: []
        });
      }

      const travelMembers = travelMembersMap.get(travel_id)!;
      travelMembers.members.push({
        userId: member_user_id,
        name: member_name,
        email: member_email ?? null,
        avatarUrl: member_avatar ?? null,
        role: member_role
      } as TravelMemberInfo);
    }

    return Array.from(travelMembersMap.values());
  }

  /**
   * 특정 여행의 멤버 목록 조회
   */
  async getTravelMembersByTravelId(
    travelId: string,
    requestingUserId: string,
  ): Promise<{ currentUser: TravelMemberInfo | null; members: TravelMemberInfo[] }> {
    // 요청하는 사용자가 해당 여행의 멤버인지 확인
    const memberCheck = await this.dataSource
      .getRepository(TravelMember)
      .findOne({
        where: { travelId, userId: requestingUserId },
        select: ['id']
      });

    if (!memberCheck) {
      throw new NotFoundException('여행을 찾을 수 없거나 접근 권한이 없습니다.');
    }

    // 해당 여행의 모든 멤버 목록 조회
    const result = await this.dataSource
      .createQueryBuilder()
      .select([
        'tm.user_id AS user_id',
        'tm.role AS role',
        'COALESCE(tm.display_name, p.name) AS name',
        'p.email AS email',
        'p.avatar_url AS avatar_url'
      ])
      .from(TravelMember, 'tm')
      .leftJoin(User, 'p', 'p.id = tm.user_id')
      .where('tm.travel_id = :travelId', { travelId })
      .orderBy('CASE WHEN tm.role = \'owner\' THEN 0 ELSE 1 END')
      .addOrderBy('tm.joined_at')
      .getRawMany();

    const members = result.map((row: any) => ({
      userId: row.user_id,
      name: row.name ?? null,
      email: row.email ?? null,
      avatarUrl: row.avatar_url ?? null,
      role: row.role
    } as TravelMemberInfo));

    const currentUser = members.find(member => member.userId === requestingUserId) ?? null;
    const others = members.filter(member => member.userId !== requestingUserId);

    return { currentUser, members: others };
  }
}
