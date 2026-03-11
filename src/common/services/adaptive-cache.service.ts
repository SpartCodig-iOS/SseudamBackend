import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from './cache.service';

export interface AdaptiveCacheOptions {
  /** 기본 TTL (초) */
  baseTtl?: number;
  /** TTL 최대 배율 (자주 조회되는 항목은 baseTtl × maxTtlMultiplier까지 자동 연장) */
  maxTtlMultiplier?: number;
  /** 캐시 태그 목록 (태그 기반 무효화에 사용) */
  tags?: string[];
}

export interface AdaptiveCacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  tagCount: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  hits: number;
  baseTtl: number;
  maxTtlMultiplier: number;
  tags: string[];
  createdAt: number;
}

/**
 * AdaptiveCacheService
 *
 * LRU 기반 인메모리 캐시 + 동적 TTL 조정 + 태그 기반 무효화를 제공합니다.
 * - 자주 조회되는 항목은 TTL이 자동으로 연장됩니다(최대 baseTtl × maxTtlMultiplier).
 * - 메모리 압박 시 LRU 정책으로 자동 제거합니다.
 * - 태그 기반 무효화로 관련 캐시를 일괄 삭제합니다.
 */
@Injectable()
export class AdaptiveCacheService {
  private readonly logger = new Logger(AdaptiveCacheService.name);
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly tagIndex = new Map<string, Set<string>>(); // tag -> Set<key>
  private readonly MAX_SIZE = 1000;
  private readonly DEFAULT_BASE_TTL = 60; // seconds
  private readonly DEFAULT_MAX_MULTIPLIER = 3;
  private readonly HIT_THRESHOLD_FOR_EXTEND = 5; // 5번 이상 조회 시 TTL 연장

  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Cache-aside 패턴으로 데이터 조회.
   * 캐시 미스 시 factory를 호출해 값을 채웁니다.
   * 자주 조회되는 항목은 TTL이 자동 연장됩니다.
   */
  async get<T>(
    key: string,
    factory: () => Promise<T>,
    options: AdaptiveCacheOptions = {},
  ): Promise<T> {
    const baseTtl = options.baseTtl ?? this.DEFAULT_BASE_TTL;
    const maxTtlMultiplier = options.maxTtlMultiplier ?? this.DEFAULT_MAX_MULTIPLIER;
    const tags = options.tags ?? [];

    // L1 캐시 조회
    const entry = this.cache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      entry.hits++;
      this.stats.hits++;

      // 핫 항목: TTL 자동 연장
      if (entry.hits >= this.HIT_THRESHOLD_FOR_EXTEND) {
        const extendedTtl = Math.min(
          baseTtl * maxTtlMultiplier,
          baseTtl * maxTtlMultiplier,
        );
        entry.expiresAt = Date.now() + extendedTtl * 1000;
        entry.hits = 0; // 카운터 리셋
      }

      return entry.value as T;
    }

    // L2 Redis 조회
    try {
      const l2Value = await this.cacheService.get<T>(key);
      if (l2Value !== null) {
        this.stats.hits++;
        this.setEntry(key, l2Value, baseTtl, maxTtlMultiplier, tags);
        return l2Value;
      }
    } catch (error) {
      this.logger.warn(`AdaptiveCache L2 get failed for key=${key}: ${(error as Error)?.message}`);
    }

    // factory 호출
    this.stats.misses++;
    const value = await factory();

    if (value !== null && value !== undefined) {
      this.setEntry(key, value, baseTtl, maxTtlMultiplier, tags);
      try {
        await this.cacheService.set(key, value, { ttl: baseTtl });
      } catch (error) {
        this.logger.warn(`AdaptiveCache L2 set failed for key=${key}: ${(error as Error)?.message}`);
      }
    }

    return value;
  }

  /**
   * 환율 전용 캐시 조회 (MetaService와의 호환성을 위해 별도 메서드 제공).
   */
  async getExchangeRate<T>(
    key: string,
    factory: () => Promise<T>,
  ): Promise<T> {
    return this.get<T>(key, factory, {
      baseTtl: 600,       // 10분
      maxTtlMultiplier: 4, // 최대 40분
      tags: ['exchange_rate'],
    });
  }

  /**
   * 캐시 값을 직접 삭제합니다.
   */
  async del(key: string): Promise<void> {
    const entry = this.cache.get(key);
    if (entry) {
      // 태그 인덱스에서 제거
      for (const tag of entry.tags) {
        this.tagIndex.get(tag)?.delete(key);
      }
      this.cache.delete(key);
    }

    try {
      await this.cacheService.del(key);
    } catch (error) {
      this.logger.warn(`AdaptiveCache del failed for key=${key}: ${(error as Error)?.message}`);
    }
  }

  /**
   * 태그 기반 단일 무효화.
   */
  async invalidateByTag(tag: string): Promise<void> {
    const keys = this.tagIndex.get(tag);
    if (keys) {
      for (const key of keys) {
        this.cache.delete(key);
      }
      this.tagIndex.delete(tag);
    }

    try {
      await this.cacheService.delPattern(`*:${tag}:*`);
    } catch (error) {
      this.logger.warn(`AdaptiveCache invalidateByTag failed for tag=${tag}: ${(error as Error)?.message}`);
    }
  }

  /**
   * 태그 기반 다중 무효화.
   */
  async invalidateByTags(tags: string[]): Promise<void> {
    await Promise.allSettled(tags.map((tag) => this.invalidateByTag(tag)));
  }

  /**
   * 캐시 통계를 반환합니다.
   */
  getStats(): AdaptiveCacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      evictions: this.stats.evictions,
      tagCount: this.tagIndex.size,
    };
  }

  private setEntry<T>(
    key: string,
    value: T,
    baseTtl: number,
    maxTtlMultiplier: number,
    tags: string[],
  ): void {
    // LRU Eviction: 최대 크기 초과 시 가장 오래된 항목 제거
    if (this.cache.size >= this.MAX_SIZE) {
      this.evictLRU();
    }

    // 기존 태그 인덱스 정리
    const existingEntry = this.cache.get(key);
    if (existingEntry) {
      for (const tag of existingEntry.tags) {
        this.tagIndex.get(tag)?.delete(key);
      }
    }

    // 새 엔트리 저장
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + baseTtl * 1000,
      hits: 0,
      baseTtl,
      maxTtlMultiplier,
      tags,
      createdAt: Date.now(),
    });

    // 태그 인덱스 등록
    for (const tag of tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(key);
    }
  }

  /**
   * LRU 정책: 가장 오랫동안 조회되지 않은 항목 제거.
   * 만료된 항목 우선 제거 후, 남으면 oldest 항목 제거.
   */
  private evictLRU(): void {
    const now = Date.now();
    let evictedExpired = false;

    // 만료된 항목 먼저 제거
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        for (const tag of entry.tags) {
          this.tagIndex.get(tag)?.delete(key);
        }
        this.cache.delete(key);
        this.stats.evictions++;
        evictedExpired = true;
        if (this.cache.size < this.MAX_SIZE) break;
      }
    }

    // 만료된 항목이 없으면 가장 오래된 항목 제거
    if (!evictedExpired) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        const firstEntry = this.cache.get(firstKey);
        if (firstEntry) {
          for (const tag of firstEntry.tags) {
            this.tagIndex.get(tag)?.delete(firstKey);
          }
        }
        this.cache.delete(firstKey);
        this.stats.evictions++;
      }
    }
  }
}
