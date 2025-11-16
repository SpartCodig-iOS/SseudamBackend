import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from './cacheService';

interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
}

interface SmartCacheOptions {
  ttl?: number;
  refreshThreshold?: number; // TTL의 몇 %가 지나면 백그라운드 갱신
  dependsOn?: string[]; // 의존하는 다른 캐시 키들
  tags?: string[]; // 태그 기반 무효화
}

@Injectable()
export class SmartCacheService {
  private readonly logger = new Logger(SmartCacheService.name);
  private readonly stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
  };

  // 백그라운드 갱신 큐
  private refreshQueue = new Set<string>();
  private dependencyMap = new Map<string, string[]>(); // key -> dependent keys
  private tagMap = new Map<string, Set<string>>(); // tag -> keys

  constructor(private readonly cacheService: CacheService) {
    // 통계 로깅 (개발환경에서만, 30분마다로 변경)
    if (process.env.NODE_ENV === 'development' || process.env.ENABLE_CACHE_STATS === 'true') {
      setInterval(() => {
        this.logStats();
      }, 30 * 60 * 1000); // 30분으로 변경
    }
  }

  // 스마트 캐시 조회 (백그라운드 갱신 지원)
  async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: SmartCacheOptions = {}
  ): Promise<T> {
    const { ttl = 300, refreshThreshold = 0.8, dependsOn = [], tags = [] } = options;

    try {
      // 캐시에서 조회
      const cached = await this.cacheService.get<{ data: T; cachedAt: number; ttl: number }>(key);

      if (cached) {
        this.stats.hits++;

        const age = Date.now() - cached.cachedAt;
        const maxAge = cached.ttl * 1000;

        // 백그라운드 갱신 조건 확인
        if (age > maxAge * refreshThreshold && !this.refreshQueue.has(key)) {
          this.scheduleBackgroundRefresh(key, fetcher, options);
        }

        // 캐시가 만료되지 않았으면 반환
        if (age < maxAge) {
          return cached.data;
        }
      }

      // 캐시 미스 또는 만료 - 데이터 패치
      this.stats.misses++;
      const data = await fetcher();

      // 캐시 저장 (비동기)
      this.setWithDependencies(key, data, options).catch(error =>
        this.logger.warn(`Failed to cache ${key}: ${error.message}`)
      );

      return data;
    } catch (error) {
      this.stats.errors++;
      this.logger.error(`Smart cache get failed for ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`);

      // 캐시 실패 시 직접 데이터 조회
      return fetcher();
    }
  }

  // 의존성과 태그를 포함한 캐시 저장
  private async setWithDependencies<T>(
    key: string,
    data: T,
    options: SmartCacheOptions
  ): Promise<void> {
    const { ttl = 300, dependsOn = [], tags = [] } = options;

    try {
      // 메인 데이터 저장
      const cacheData = {
        data,
        cachedAt: Date.now(),
        ttl,
      };

      await this.cacheService.set(key, cacheData, { ttl });
      this.stats.sets++;

      // 의존성 등록
      if (dependsOn.length > 0) {
        for (const depKey of dependsOn) {
          const dependents = this.dependencyMap.get(depKey) || [];
          if (!dependents.includes(key)) {
            dependents.push(key);
            this.dependencyMap.set(depKey, dependents);
          }
        }
      }

      // 태그 등록
      if (tags.length > 0) {
        for (const tag of tags) {
          if (!this.tagMap.has(tag)) {
            this.tagMap.set(tag, new Set());
          }
          this.tagMap.get(tag)!.add(key);
        }
      }
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  // 백그라운드 갱신 스케줄링
  private async scheduleBackgroundRefresh<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: SmartCacheOptions
  ): Promise<void> {
    if (this.refreshQueue.has(key)) {
      return;
    }

    this.refreshQueue.add(key);

    // 비동기로 백그라운드 갱신 실행
    setImmediate(async () => {
      try {
        this.logger.debug(`Background refresh started for ${key}`);
        const data = await fetcher();
        await this.setWithDependencies(key, data, options);
        this.logger.debug(`Background refresh completed for ${key}`);
      } catch (error) {
        this.logger.warn(`Background refresh failed for ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        this.refreshQueue.delete(key);
      }
    });
  }

  // 키 삭제 (의존성 전파)
  async del(key: string): Promise<void> {
    try {
      await this.cacheService.del(key);
      this.stats.deletes++;

      // 의존하는 키들도 삭제
      const dependents = this.dependencyMap.get(key);
      if (dependents && dependents.length > 0) {
        const deletePromises = dependents.map(depKey => this.del(depKey));
        await Promise.allSettled(deletePromises);
        this.dependencyMap.delete(key);
      }

      // 태그에서 제거
      for (const [tag, keys] of this.tagMap.entries()) {
        if (keys.has(key)) {
          keys.delete(key);
          if (keys.size === 0) {
            this.tagMap.delete(tag);
          }
        }
      }
    } catch (error) {
      this.stats.errors++;
      this.logger.error(`Failed to delete cache key ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // 태그 기반 무효화
  async invalidateByTag(tag: string): Promise<void> {
    const keys = this.tagMap.get(tag);
    if (!keys || keys.size === 0) {
      return;
    }

    this.logger.debug(`Invalidating ${keys.size} cache keys with tag: ${tag}`);

    const deletePromises = Array.from(keys).map(key => this.del(key));
    await Promise.allSettled(deletePromises);

    this.tagMap.delete(tag);
  }

  // 패턴 기반 무효화
  async invalidateByPattern(pattern: string): Promise<void> {
    try {
      await this.cacheService.delPattern(pattern);
      this.logger.debug(`Invalidated cache keys matching pattern: ${pattern}`);
    } catch (error) {
      this.stats.errors++;
      this.logger.error(`Pattern invalidation failed for ${pattern}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // 사전 로딩 (워밍업)
  async warmup<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: SmartCacheOptions = {}
  ): Promise<void> {
    try {
      this.logger.debug(`Warming up cache for ${key}`);
      const data = await fetcher();
      await this.setWithDependencies(key, data, options);
      this.logger.debug(`Cache warmed up for ${key}`);
    } catch (error) {
      this.logger.warn(`Cache warmup failed for ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // 캐시 통계 조회
  getStats(): CacheStats & { hitRate: number; refreshQueueSize: number } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;

    return {
      ...this.stats,
      hitRate: parseFloat(hitRate.toFixed(2)),
      refreshQueueSize: this.refreshQueue.size,
    };
  }

  // 통계 로깅
  private logStats(): void {
    const stats = this.getStats();
    this.logger.log(`Cache Stats - Hit Rate: ${stats.hitRate}%, Hits: ${stats.hits}, Misses: ${stats.misses}, Errors: ${stats.errors}, Queue: ${stats.refreshQueueSize}`);
  }

  // 비용 관련 캐시 헬퍼 메서드들
  async getExpenseAggregation(
    travelId: string,
    fetcher: () => Promise<any>
  ): Promise<any> {
    return this.get(
      `expense_agg:${travelId}`,
      fetcher,
      {
        ttl: 600, // 10분
        refreshThreshold: 0.7,
        tags: [`travel:${travelId}`, 'expenses'],
      }
    );
  }

  async getUserTravelList(
    userId: string,
    page: number,
    limit: number,
    fetcher: () => Promise<any>
  ): Promise<any> {
    return this.get(
      `user_travels:${userId}:${page}:${limit}`,
      fetcher,
      {
        ttl: 300, // 5분
        refreshThreshold: 0.8,
        tags: [`user:${userId}`, 'travels'],
      }
    );
  }

  async getTravelMembers(
    travelId: string,
    fetcher: () => Promise<any>
  ): Promise<any> {
    return this.get(
      `travel_members:${travelId}`,
      fetcher,
      {
        ttl: 900, // 15분
        refreshThreshold: 0.9,
        tags: [`travel:${travelId}`, 'members'],
      }
    );
  }

  // 여행 관련 캐시 무효화
  async invalidateTravelCaches(travelId: string): Promise<void> {
    await this.invalidateByTag(`travel:${travelId}`);
  }

  // 사용자 관련 캐시 무효화
  async invalidateUserCaches(userId: string): Promise<void> {
    await this.invalidateByTag(`user:${userId}`);
  }

  // 비용 관련 캐시 무효화
  async invalidateExpenseCaches(): Promise<void> {
    await this.invalidateByTag('expenses');
  }
}