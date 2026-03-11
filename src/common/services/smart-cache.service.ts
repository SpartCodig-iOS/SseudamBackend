import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from './cache.service';

export interface SmartCacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
}

/**
 * SmartCacheService
 *
 * Cache-aside 패턴과 선제적 갱신(proactive refresh)을 지원하는 고수준 캐시 서비스.
 * CacheService(L2 Redis/Memory)를 기반으로 L1 인메모리 LRU 캐시를 추가합니다.
 */
@Injectable()
export class SmartCacheService {
  private readonly logger = new Logger(SmartCacheService.name);
  private readonly l1Cache = new Map<string, { value: unknown; expiresAt: number; hits: number }>();
  private readonly MAX_L1_SIZE = 500;
  private readonly DEFAULT_TTL = 60; // seconds

  private stats = {
    hits: 0,
    misses: 0,
  };

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Cache-aside 패턴으로 데이터 조회.
   * L1(인메모리) → L2(Redis/Memory fallback) → factory 순으로 탐색합니다.
   */
  async get<T>(
    key: string,
    factory: () => Promise<T>,
    ttl: number = this.DEFAULT_TTL,
  ): Promise<T> {
    // L1 캐시 조회
    const l1Entry = this.l1Cache.get(key);
    if (l1Entry && l1Entry.expiresAt > Date.now()) {
      l1Entry.hits++;
      this.stats.hits++;
      return l1Entry.value as T;
    }

    // L2 캐시 조회
    try {
      const l2Value = await this.cacheService.get<T>(key);
      if (l2Value !== null) {
        this.stats.hits++;
        this.setL1(key, l2Value, ttl);
        return l2Value;
      }
    } catch (error) {
      this.logger.warn(`SmartCache L2 get failed for key=${key}: ${(error as Error)?.message}`);
    }

    // factory 호출
    this.stats.misses++;
    const value = await factory();
    if (value !== null && value !== undefined) {
      this.setL1(key, value, ttl);
      try {
        await this.cacheService.set(key, value, { ttl });
      } catch (error) {
        this.logger.warn(`SmartCache L2 set failed for key=${key}: ${(error as Error)?.message}`);
      }
    }

    return value;
  }

  /**
   * 캐시 값을 직접 설정합니다.
   */
  async set<T>(key: string, value: T, ttl: number = this.DEFAULT_TTL): Promise<void> {
    this.setL1(key, value, ttl);
    try {
      await this.cacheService.set(key, value, { ttl });
    } catch (error) {
      this.logger.warn(`SmartCache set failed for key=${key}: ${(error as Error)?.message}`);
    }
  }

  /**
   * 캐시 값을 삭제합니다.
   */
  async del(key: string): Promise<void> {
    this.l1Cache.delete(key);
    try {
      await this.cacheService.del(key);
    } catch (error) {
      this.logger.warn(`SmartCache del failed for key=${key}: ${(error as Error)?.message}`);
    }
  }

  /**
   * 패턴 기반 캐시 무효화.
   */
  async invalidatePattern(pattern: string): Promise<void> {
    // L1 패턴 삭제
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    const regex = new RegExp(`^${escaped}$`);
    for (const key of this.l1Cache.keys()) {
      if (regex.test(key)) {
        this.l1Cache.delete(key);
      }
    }

    // L2 패턴 삭제
    try {
      await this.cacheService.delPattern(pattern);
    } catch (error) {
      this.logger.warn(`SmartCache invalidatePattern failed for pattern=${pattern}: ${(error as Error)?.message}`);
    }
  }

  /**
   * 캐시 통계를 반환합니다.
   */
  getStats(): SmartCacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      size: this.l1Cache.size,
    };
  }

  private setL1<T>(key: string, value: T, ttlSeconds: number): void {
    // LRU: 최대 크기 초과 시 가장 오래된 항목 제거
    if (this.l1Cache.size >= this.MAX_L1_SIZE) {
      const oldestKey = this.l1Cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.l1Cache.delete(oldestKey);
      }
    }

    this.l1Cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
      hits: 0,
    });
  }
}
