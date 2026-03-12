import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { CacheService } from '../../common/services/cache.service';
import { MetaService } from '../meta/meta.service';
import { Travel } from './entities/travel.entity';
import { TravelMember } from './entities/travel-member.entity';
import { User } from '../user/entities/user.entity';

interface TravelMemberSummary {
  userId: string;
  name: string | null;
  role: string;
}

interface OptimizedTravelSummary {
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
  budget?: number; // 예산 (minor units)
  budgetCurrency?: string; // 예산 통화 (ISO 4217)
  inviteCode?: string;
  status: string;
  role: string;
  createdAt: string;
  ownerName: string | null;
  members?: TravelMemberSummary[]; // 멤버 정보 (includeMembers=true 시)
  memberCount?: number; // 멤버 수만 반환 (includeMembers=false 시)
}

@Injectable()
export class OptimizedTravelService {
  private readonly logger = new Logger(OptimizedTravelService.name);
  private readonly CACHE_TTL = 120; // 2분 캐시 (빠른 응답 최적화)
  private readonly TRAVEL_LIST_CACHE_PREFIX = 'user_travels';
  private readonly TRAVEL_DETAIL_CACHE_PREFIX = 'travel_detail';
  private readonly countryCurrencyCache = new Map<string, string>();
  private countryCurrencyLoaded = false;
  private countryCurrencyLoadPromise: Promise<void> | null = null;
  private readonly CACHE_TTL_SECONDS = 1; // Redis 캐시 TTL (최대한 짧게 실시간 반영)
  private readonly transactionTimeoutMs = 5000;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly cacheService: CacheService,
    private readonly metaService: MetaService,
  ) {}

  // 캐시 키 생성
  private getTravelListCacheKey(
    userId: string,
    page: number,
    limit: number,
    status?: 'active' | 'archived',
  ): string {
    return `${this.TRAVEL_LIST_CACHE_PREFIX}:${userId}:${page}:${limit}:${status ?? 'all'}`;
  }

  private getTravelDetailCacheKey(travelId: string): string {
    return `${this.TRAVEL_DETAIL_CACHE_PREFIX}:${travelId}`;
  }

  // 최적화된 여행 목록 조회 (멤버 정보 없이 빠른 조회)
  async listTravelsOptimized(
    userId: string,
    pagination: { page?: number; limit?: number; status?: 'active' | 'archived'; sort?: 'recent' | 'start_date' | 'start_date_desc' } = {},
    includeMembers = false,
  ): Promise<{ total: number; page: number; limit: number; items: OptimizedTravelSummary[] }> {
    const page = Math.max(1, pagination.page ?? 1);
    const limit = Math.min(100, Math.max(1, pagination.limit ?? 20));
    const offset = (page - 1) * limit;
    const status = pagination.status === 'active' || pagination.status === 'archived' ? pagination.status : undefined;
    const sort: 'start_date' = 'start_date'; // 파라미터 없이 시작일 오름차순 고정

    // 국가-통화 매핑 확인 (백그라운드로 실행)
    this.ensureCountryCurrencyLoaded().catch(error =>
      this.logger.warn(`Failed to load country currency mapping: ${error.message}`)
    );

    const startTime = process.hrtime.bigint();
    const cacheKey = this.getTravelListCacheKey(userId, page, limit, status);

    // Redis 캐시 조회 (짧은 TTL)
    try {
      const cached = await this.cacheService.get<{ total: number; page: number; limit: number; items: OptimizedTravelSummary[] }>(cacheKey);
      if (cached) {
        this.logger.debug(`Travel list cache hit (redis) for user ${userId}`);
        return cached;
      }
    } catch (error) {
      this.logger.warn(`Travel list cache read failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    try {
      // 병렬로 총 개수와 목록 조회
      const [totalRows, listRows] = await Promise.all([
        this.getTotalTravelsCount(userId, status),
        this.getTravelsList(userId, limit, offset, includeMembers, status, sort),
      ]);

      const total = totalRows[0]?.total ?? 0;
      const items = listRows.map(this.transformTravelRow);

      const result = {
        total,
        page,
        limit,
        items,
      };

      // Redis 캐시에 짧게 저장 (비동기)
      this.cacheService.set(cacheKey, result, { ttl: this.CACHE_TTL_SECONDS }).catch(error =>
        this.logger.warn(`Failed to cache travel list: ${error.message}`)
      );

      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;

      if (durationMs > 200) {
        this.logger.warn(`Slow travel list query: ${durationMs.toFixed(2)}ms for user ${userId}`);
      }

      return result;
    } catch (error) {
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;

      this.logger.error(`Travel list query failed after ${durationMs.toFixed(2)}ms: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  private async getTotalTravelsCount(userId: string, status?: 'active' | 'archived'): Promise<any[]> {
    let queryBuilder = this.dataSource.createQueryBuilder()
      .select('COUNT(*)', 'total')
      .from('travel_members', 'tm')
      .innerJoin('travels', 't', 't.id = tm.travel_id')
      .where('tm.user_id = :userId', { userId });

    // 상태 조건 추가
    if (status === 'active') {
      queryBuilder = queryBuilder.andWhere('t.end_date >= CURRENT_DATE');
    } else if (status === 'archived') {
      queryBuilder = queryBuilder.andWhere('t.end_date < CURRENT_DATE');
    }

    const result = await queryBuilder.getRawOne();
    return [{ total: parseInt(result.total) }];
  }

  private async getTravelsList(
    userId: string,
    limit: number,
    offset: number,
    includeMembers: boolean,
    status: 'active' | 'archived' | undefined,
    sort: 'recent' | 'start_date' | 'start_date_desc',
  ): Promise<any[]> {
    // 상태 조건과 정렬은 아래에서 TypeORM 방식으로 처리

    if (includeMembers) {
      // 멤버 정보 포함 (최적화된 쿼리를 TypeORM QueryBuilder로 변환)
      let queryBuilder = this.dataSource
        .createQueryBuilder()
        .select([
          `t.id AS id`,
          `t.title AS title`,
          `to_char(t.start_date::date, 'YYYY-MM-DD') AS start_date`,
          `to_char(t.end_date::date, 'YYYY-MM-DD') AS end_date`,
          `t.country_code AS country_code`,
          `t.country_name_kr AS country_name_kr`,
          `t.country_currencies AS country_currencies`,
          `t.base_currency AS base_currency`,
          `t.base_exchange_rate AS base_exchange_rate`,
          `t.budget AS budget`,
          `t.budget_currency AS budget_currency`,
          `ti.invite_code AS invite_code`,
          `CASE WHEN t.end_date < CURRENT_DATE THEN 'archived' ELSE 'active' END AS status`,
          `tm.role AS role`,
          `t.created_at AS created_at`,
          `owner_profile.name AS owner_name`,
          `COALESCE(members.members, '[]'::json) AS members`,
        ])
        .from(Travel, 't')
        .innerJoin(TravelMember, 'tm', 'tm.travel_id = t.id AND tm.user_id = :userId', { userId })
        .innerJoin(User, 'owner_profile', 'owner_profile.id = t.owner_id')
        .leftJoin(
          '(SELECT travel_id, invite_code FROM travel_invites WHERE status = :inviteStatus)',
          'ti',
          'ti.travel_id = t.id',
          { inviteStatus: 'active' }
        )
        .leftJoin(
          `(SELECT
             tm2.travel_id,
             json_agg(
               json_build_object(
                 'userId', tm2.user_id,
                 'name', COALESCE(tm2.display_name, p.name),
                 'role', tm2.role
               )
               ORDER BY tm2.joined_at
             ) AS members
           FROM travel_members tm2
           LEFT JOIN profiles p ON p.id = tm2.user_id
           GROUP BY tm2.travel_id)`,
          'members',
          'members.travel_id = t.id'
        );

      // 상태 조건 추가
      if (status === 'active') {
        queryBuilder = queryBuilder.andWhere('t.end_date >= CURRENT_DATE');
      } else if (status === 'archived') {
        queryBuilder = queryBuilder.andWhere('t.end_date < CURRENT_DATE');
      }

      // 정렬 조건 추가
      switch (sort) {
        case 'start_date':
          queryBuilder = queryBuilder.orderBy('t.start_date', 'ASC').addOrderBy('t.created_at', 'DESC');
          break;
        case 'start_date_desc':
          queryBuilder = queryBuilder.orderBy('t.start_date', 'DESC').addOrderBy('t.created_at', 'DESC');
          break;
        default:
          queryBuilder = queryBuilder.orderBy('t.created_at', 'DESC');
      }

      return queryBuilder
        .limit(limit)
        .offset(offset)
        .getRawMany();
    } else {
      // 멤버 정보 없이 빠른 조회 (성능 최적화: DB에서 status 계산)
      let queryBuilder = this.dataSource
        .createQueryBuilder()
        .select([
          `t.id AS id`,
          `t.title AS title`,
          `to_char(t.start_date::date, 'YYYY-MM-DD') AS start_date`,
          `to_char(t.end_date::date, 'YYYY-MM-DD') AS end_date`,
          `t.country_code AS country_code`,
          `t.country_name_kr AS country_name_kr`,
          `t.country_currencies AS country_currencies`,
          `t.base_currency AS base_currency`,
          `t.base_exchange_rate AS base_exchange_rate`,
          `t.budget AS budget`,
          `t.budget_currency AS budget_currency`,
          `ti.invite_code AS invite_code`,
          `CASE WHEN t.end_date < CURRENT_DATE THEN 'archived' ELSE 'active' END AS status`,
          `tm.role AS role`,
          `t.created_at AS created_at`,
          `owner_profile.name AS owner_name`,
          `member_counts.member_count AS member_count`,
        ])
        .from(Travel, 't')
        .innerJoin(TravelMember, 'tm', 'tm.travel_id = t.id AND tm.user_id = :userId', { userId })
        .innerJoin(User, 'owner_profile', 'owner_profile.id = t.owner_id')
        .leftJoin(
          '(SELECT travel_id, invite_code FROM travel_invites WHERE status = :inviteStatus)',
          'ti',
          'ti.travel_id = t.id',
          { inviteStatus: 'active' }
        )
        .leftJoin(
          '(SELECT travel_id, COUNT(*)::int AS member_count FROM travel_members GROUP BY travel_id)',
          'member_counts',
          'member_counts.travel_id = t.id'
        );

      // 상태 조건 추가
      if (status === 'active') {
        queryBuilder = queryBuilder.andWhere('t.end_date >= CURRENT_DATE');
      } else if (status === 'archived') {
        queryBuilder = queryBuilder.andWhere('t.end_date < CURRENT_DATE');
      }

      // 정렬 조건 추가
      switch (sort) {
        case 'start_date':
          queryBuilder = queryBuilder.orderBy('t.start_date', 'ASC').addOrderBy('t.created_at', 'DESC');
          break;
        case 'start_date_desc':
          queryBuilder = queryBuilder.orderBy('t.start_date', 'DESC').addOrderBy('t.created_at', 'DESC');
          break;
        default:
          queryBuilder = queryBuilder.orderBy('t.created_at', 'DESC');
      }

      return queryBuilder
        .limit(limit)
        .offset(offset)
        .getRawMany();
    }
  }

  // 공통 트랜잭션 래퍼 (TypeORM DataSource 방식)
  private async withTransaction<T>(callback: (manager: any) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(callback);
  }

  private transformTravelRow = (row: any): OptimizedTravelSummary => {
    const destinationCurrency = this.resolveDestinationCurrency(row.country_code, row.base_currency);
    const result: OptimizedTravelSummary = {
      id: row.id,
      title: row.title,
      startDate: row.start_date,
      endDate: row.end_date,
      countryCode: row.country_code,
      countryNameKr: row.country_name_kr ?? undefined,
      baseCurrency: row.base_currency,
      baseExchangeRate: parseFloat(row.base_exchange_rate),
      destinationCurrency,
      countryCurrencies: Array.isArray(row.country_currencies) ? row.country_currencies : [],
      budget: row.budget ? Number(row.budget) : undefined,
      budgetCurrency: row.budget_currency ?? undefined,
      inviteCode: row.invite_code,
      status: row.status,
      role: row.role,
      createdAt: row.created_at,
      ownerName: row.owner_name,
    };

    // 멤버 정보가 있으면 members 배열로, 없으면 memberCount로
    if (row.members) {
      const members = typeof row.members === 'string' ? JSON.parse(row.members) : row.members;
      result.members = (members || []).map((m: any) => ({
        userId: m.userId,
        name: m.name ?? null,
        role: m.role,
      } as TravelMemberSummary));
    } else if (row.member_count !== undefined) {
      result.memberCount = row.member_count;
    }

    return result;
  };

  // 여행 상세 정보 캐시드 조회
  async getTravelDetailCached(travelId: string, userId: string): Promise<any> {
    const cacheKey = this.getTravelDetailCacheKey(travelId);

    // Redis 캐시 조회 (짧은 TTL)
    try {
      const cached = await this.cacheService.get(cacheKey);
      if (cached) {
        this.logger.debug(`Travel detail cache hit (redis) for travel ${travelId}`);
        return cached;
      }
    } catch (error) {
      this.logger.warn(`Travel detail cache read failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    const result = await this.dataSource
      .createQueryBuilder()
      .select([
        `t.id AS id`,
        `t.title AS title`,
        `to_char(t.start_date::date, 'YYYY-MM-DD') AS start_date`,
        `to_char(t.end_date::date, 'YYYY-MM-DD') AS end_date`,
        `t.country_code AS country_code`,
        `t.country_name_kr AS country_name_kr`,
        `t.country_currencies AS country_currencies`,
        `t.base_currency AS base_currency`,
        `t.base_exchange_rate AS base_exchange_rate`,
        `t.budget AS budget`,
        `t.budget_currency AS budget_currency`,
        `t.invite_code AS invite_code`,
        `t.status AS status`,
        `t.created_at AS created_at`,
        `tm.role AS role`,
        `owner_profile.name AS owner_name`,
        `COALESCE(members.members, '[]'::json) AS members`,
      ])
      .from(Travel, 't')
      .innerJoin(TravelMember, 'tm', 'tm.travel_id = t.id AND tm.user_id = :userId', { userId })
      .innerJoin(User, 'owner_profile', 'owner_profile.id = t.owner_id')
      .leftJoin(
        `(SELECT
           tm2.travel_id,
           json_agg(
             json_build_object(
               'userId', tm2.user_id,
               'name', COALESCE(tm2.display_name, p.name),
               'role', tm2.role
             )
             ORDER BY tm2.joined_at
           ) AS members
         FROM travel_members tm2
         LEFT JOIN profiles p ON p.id = tm2.user_id
         GROUP BY tm2.travel_id)`,
        'members',
        'members.travel_id = t.id'
      )
      .where('t.id = :travelId', { travelId })
      .getRawMany();

    if (!result || result.length === 0) {
      return null;
    }

    const travel = this.transformTravelRow(result[0]);

    // Redis 캐시에 짧게 저장 (비동기)
    this.cacheService.set(cacheKey, travel, { ttl: this.CACHE_TTL_SECONDS }).catch(error =>
      this.logger.warn(`Failed to cache travel detail: ${error.message}`)
    );

    return travel;
  }

  // 캐시 무효화 메서드들
  async invalidateTravelListCache(userId: string): Promise<void> {
    try {
      await this.cacheService.delPattern(`${this.TRAVEL_LIST_CACHE_PREFIX}:${userId}:*`);
      this.logger.debug(`Invalidated travel list cache for user ${userId}`);
    } catch (error) {
      this.logger.warn(`Failed to invalidate travel list cache: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async invalidateTravelDetailCache(travelId: string): Promise<void> {
    try {
      const cacheKey = this.getTravelDetailCacheKey(travelId);
      await this.cacheService.del(cacheKey);
      this.logger.debug(`Invalidated travel detail cache for travel ${travelId}`);
    } catch (error) {
      this.logger.warn(`Failed to invalidate travel detail cache: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // 여행 멤버들의 캐시 무효화
  async invalidateMemberTravelCaches(memberIds: string[]): Promise<void> {
    const promises = memberIds.map(memberId => this.invalidateTravelListCache(memberId));
    await Promise.allSettled(promises);
  }

  // 배치 여행 정보 조회 (최적화)
  async getTravelsBatch(travelIds: string[]): Promise<Map<string, any>> {
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
      } else {
        uncachedIds.push(id);
      }
    }

    // 캐시되지 않은 여행들을 배치로 조회
    if (uncachedIds.length > 0) {
      const batchRows = await this.dataSource
        .createQueryBuilder()
        .select([
          `t.id AS id`,
          `t.title AS title`,
          `to_char(t.start_date::date, 'YYYY-MM-DD') AS start_date`,
          `to_char(t.end_date::date, 'YYYY-MM-DD') AS end_date`,
          `t.country_code AS country_code`,
          `t.country_name_kr AS country_name_kr`,
          `t.base_currency AS base_currency`,
          `t.base_exchange_rate AS base_exchange_rate`,
          `t.budget AS budget`,
          `t.budget_currency AS budget_currency`,
          `t.invite_code AS invite_code`,
          `t.status AS status`,
          `t.created_at AS created_at`,
          `owner_profile.name AS owner_name`,
        ])
        .from(Travel, 't')
        .innerJoin(User, 'owner_profile', 'owner_profile.id = t.owner_id')
        .where('t.id IN (:...travelIds)', { travelIds: uncachedIds })
        .getRawMany();

      // 조회 결과를 캐시에 저장
      for (const row of batchRows) {
        const travel = this.transformTravelRow(row);
        cachedTravels.set(row.id, travel);

        // 비동기로 캐시 저장
        const cacheKey = this.getTravelDetailCacheKey(row.id);
        this.cacheService.set(cacheKey, travel, { ttl: this.CACHE_TTL }).catch(error =>
          this.logger.warn(`Failed to cache travel ${row.id}: ${error.message}`)
        );
      }
    }

    return cachedTravels;
  }

  // 국가-통화 매핑 캐시 로딩
  private async ensureCountryCurrencyLoaded(): Promise<void> {
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

  private async loadCountryCurrencyMapping(): Promise<void> {
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
    } catch (error) {
      this.logger.error('Failed to load country-currency mapping:', error);
    }
  }

  private resolveDestinationCurrency(countryCode: string, baseCurrency?: string | null): string {
    const code = (countryCode ?? '').toUpperCase();
    return this.countryCurrencyCache.get(code) ?? (baseCurrency ?? 'USD');
  }
}
