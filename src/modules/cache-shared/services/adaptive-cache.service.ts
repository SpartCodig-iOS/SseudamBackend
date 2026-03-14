import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from './cacheService';

export interface CacheMetrics {
  hitRate: number;
  missCount: number;
  totalRequests: number;
  avgResponseTime: number;
}

export interface AdaptiveCacheOptions {
  baseTtl: number; // 기본 TTL (초)
  minTtl?: number; // 최소 TTL (초)
  maxTtl?: number; // 최대 TTL (초)
  hitRateThreshold?: number; // 히트율 임계값
  autoAdjust?: boolean; // 자동 조정 활성화
}

@Injectable()
export class AdaptiveCacheService {
  private readonly logger = new Logger(AdaptiveCacheService.name);
  private readonly metrics = new Map<string, CacheMetrics>();
  private readonly requestTimes = new Map<string, number[]>();

  constructor(private readonly cacheService: CacheService) {}

  /**
   * 적응형 캐시 조회
   */
  async get<T>(key: string, options?: AdaptiveCacheOptions): Promise<T | null> {
    const startTime = Date.now();

    try {
      const value = await this.cacheService.get<T>(key);
      const responseTime = Date.now() - startTime;

      // 메트릭 업데이트
      this.updateMetrics(key, true, responseTime);

      if (value !== null && options?.autoAdjust) {
        // 히트 시 TTL 연장 고려
        await this.adjustTtlOnHit(key, options);
      }

      return value;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updateMetrics(key, false, responseTime);

      this.logger.error(`Adaptive cache get failed for key ${key}:`, error);
      return null;
    }
  }

  /**
   * 적응형 캐시 저장
   */
  async set<T>(
    key: string,
    value: T,
    options: AdaptiveCacheOptions
  ): Promise<void> {
    try {
      const ttl = this.calculateOptimalTtl(key, options);

      await this.cacheService.set(key, value, { ttl });

      this.logger.debug(`Adaptive cache set: ${key} (TTL: ${ttl}s)`);
    } catch (error) {
      this.logger.error(`Adaptive cache set failed for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * 최적 TTL 계산
   */
  private calculateOptimalTtl(key: string, options: AdaptiveCacheOptions): number {
    const metrics = this.metrics.get(key);

    if (!metrics || !options.autoAdjust) {
      return options.baseTtl;
    }

    const {
      baseTtl,
      minTtl = baseTtl * 0.1,
      maxTtl = baseTtl * 10,
      hitRateThreshold = 0.8,
    } = options;

    // 히트율 기반 TTL 조정
    if (metrics.hitRate > hitRateThreshold) {
      // 히트율이 높으면 TTL 증가
      const adjustedTtl = baseTtl * (1 + (metrics.hitRate - hitRateThreshold) * 2);
      return Math.min(adjustedTtl, maxTtl);
    } else {
      // 히트율이 낮으면 TTL 감소
      const adjustedTtl = baseTtl * metrics.hitRate;
      return Math.max(adjustedTtl, minTtl);
    }
  }

  /**
   * 히트 시 TTL 조정
   */
  private async adjustTtlOnHit(key: string, options: AdaptiveCacheOptions): Promise<void> {
    try {
      const metrics = this.metrics.get(key);
      if (!metrics) return;

      // 연속 히트가 많으면 TTL 연장
      if (metrics.hitRate > 0.9) {
        const currentTtl = await this.cacheService.getTtl(key);
        if (currentTtl && currentTtl > 0) {
          const extendedTtl = Math.min(
            currentTtl * 1.5,
            options.maxTtl || options.baseTtl * 10
          );

          await this.cacheService.expire(key, Math.floor(extendedTtl));

          this.logger.debug(`TTL extended for ${key}: ${currentTtl} -> ${extendedTtl}`);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to adjust TTL for ${key}:`, error);
    }
  }

  /**
   * 메트릭 업데이트
   */
  private updateMetrics(key: string, hit: boolean, responseTime: number): void {
    let metrics = this.metrics.get(key);

    if (!metrics) {
      metrics = {
        hitRate: 0,
        missCount: 0,
        totalRequests: 0,
        avgResponseTime: 0,
      };
      this.metrics.set(key, metrics);
    }

    metrics.totalRequests++;

    if (hit) {
      metrics.hitRate = ((metrics.hitRate * (metrics.totalRequests - 1)) + 1) / metrics.totalRequests;
    } else {
      metrics.missCount++;
      metrics.hitRate = (metrics.hitRate * (metrics.totalRequests - 1)) / metrics.totalRequests;
    }

    // 응답 시간 추적 (최근 100개만 유지)
    let responseTimes = this.requestTimes.get(key) || [];
    responseTimes.push(responseTime);

    if (responseTimes.length > 100) {
      responseTimes = responseTimes.slice(-100);
    }

    this.requestTimes.set(key, responseTimes);
    metrics.avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

    // 주기적으로 오래된 메트릭 정리 (메모리 누수 방지)
    if (metrics.totalRequests > 10000) {
      this.resetMetrics(key);
    }
  }

  /**
   * 메트릭 리셋
   */
  private resetMetrics(key: string): void {
    this.metrics.delete(key);
    this.requestTimes.delete(key);
    this.logger.debug(`Metrics reset for key: ${key}`);
  }

  /**
   * 캐시 메트릭 조회
   */
  getMetrics(key: string): CacheMetrics | null {
    return this.metrics.get(key) || null;
  }

  /**
   * 전체 캐시 통계 조회
   */
  getAllMetrics(): Record<string, CacheMetrics> {
    const result: Record<string, CacheMetrics> = {};

    for (const [key, metrics] of this.metrics.entries()) {
      result[key] = { ...metrics };
    }

    return result;
  }

  /**
   * 성능이 낮은 캐시 키 조회
   */
  getPoorPerformingKeys(hitRateThreshold = 0.5): string[] {
    const poorKeys: string[] = [];

    for (const [key, metrics] of this.metrics.entries()) {
      if (metrics.totalRequests > 10 && metrics.hitRate < hitRateThreshold) {
        poorKeys.push(key);
      }
    }

    return poorKeys;
  }

  /**
   * 캐시 최적화 제안
   */
  getOptimizationSuggestions(): Array<{
    key: string;
    suggestion: string;
    currentMetrics: CacheMetrics;
  }> {
    const suggestions: Array<{
      key: string;
      suggestion: string;
      currentMetrics: CacheMetrics;
    }> = [];

    for (const [key, metrics] of this.metrics.entries()) {
      if (metrics.totalRequests < 5) continue;

      let suggestion = '';

      if (metrics.hitRate < 0.3) {
        suggestion = 'Consider removing this cache key due to low hit rate';
      } else if (metrics.hitRate > 0.9 && metrics.avgResponseTime > 100) {
        suggestion = 'Consider increasing TTL due to high hit rate but slow response';
      } else if (metrics.hitRate < 0.6 && metrics.avgResponseTime < 10) {
        suggestion = 'Consider decreasing TTL due to low hit rate but fast response';
      }

      if (suggestion) {
        suggestions.push({
          key,
          suggestion,
          currentMetrics: { ...metrics },
        });
      }
    }

    return suggestions;
  }

  /**
   * 메트릭 정리 (정기 실행용)
   */
  async cleanupMetrics(): Promise<void> {
    const now = Date.now();
    const cutoffTime = now - 24 * 60 * 60 * 1000; // 24시간 전

    let cleanedCount = 0;

    for (const [key, metrics] of this.metrics.entries()) {
      // 요청이 적거나 오래된 메트릭 정리
      if (metrics.totalRequests < 2) {
        this.resetMetrics(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`Cleaned up ${cleanedCount} cache metrics`);
    }
  }

  /**
   * 단일 태그로 캐시 무효화
   */
  async invalidateByTag(tag: string): Promise<number> {
    return this.cacheService.invalidateByTag(tag);
  }

  /**
   * 여러 태그로 캐시 무효화
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    return this.cacheService.invalidateByTags(tags);
  }

  /**
   * 캐시 키 삭제
   */
  async del(key: string): Promise<void> {
    return this.cacheService.del(key);
  }

  /**
   * 적응형 캐시 삭제 (메트릭과 함께)
   */
  async delete(key: string): Promise<void> {
    await this.del(key);
    this.resetMetrics(key);
  }
}