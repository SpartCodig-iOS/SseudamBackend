import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CacheService } from '../../cache-shared/services/cacheService';
// import { MetaService } from '../../meta/meta.service'; // 임시 주석
import { OptimizedTravelRepository } from '../repositories/optimized-travel.repository';

interface TravelMember {
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
  members?: TravelMember[]; // 멤버 정보 (includeMembers=true 시)
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
    private readonly optimizedTravelRepository: OptimizedTravelRepository,
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
      const [total, listRows] = await Promise.all([
        this.optimizedTravelRepository.getTotalTravelsCount(userId, status),
        this.optimizedTravelRepository.getTravelsList(userId, limit, offset, includeMembers, status, sort),
      ]);

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

  // Removed raw SQL methods - now using repository

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
      }));
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

    const result = await this.optimizedTravelRepository.getTravelDetail(travelId, userId);

    if (!result) {
      return null;
    }

    const travel = this.transformTravelRow(result);

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
      const batchRows = await this.optimizedTravelRepository.getTravelsBatch(uncachedIds);

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
