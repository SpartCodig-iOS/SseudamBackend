import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from './cache.service';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
}

/**
 * Redis 기반 Sliding Window Counter Rate Limiter
 *
 * 동작 원리:
 *   - 현재 시각 기준으로 windowMs 범위의 타임스탬프 목록을 Redis Sorted Set에 보관
 *   - 요청마다 만료된 항목을 제거(ZREMRANGEBYSCORE)하고 현재 카운트를 조회
 *   - 다중 인스턴스 환경에서도 Redis를 통해 정확한 카운트 공유
 *   - Redis 장애 시 인메모리 Fixed Window 방식으로 자동 폴백
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly REDIS_PREFIX = 'rl:';

  // Redis 장애 시 폴백용 인메모리 버킷
  private readonly fallbackBuckets = new Map<string, { count: number; resetAt: number }>();
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
  private lastCleanup = 0;

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Redis Sliding Window Counter 방식으로 rate limit 체크 및 카운트 증가
   * Redis가 불가한 경우 인메모리 Fixed Window로 폴백
   */
  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const redisResult = await this.consumeRedis(key, limit, windowMs, now);
    if (redisResult !== null) {
      return redisResult;
    }
    return this.consumeFallback(key, limit, windowMs, now);
  }

  /**
   * Redis Sorted Set 기반 sliding window 구현
   * - ZADD: 현재 요청 타임스탬프 추가
   * - ZREMRANGEBYSCORE: 윈도우 밖의 오래된 항목 제거
   * - ZCARD: 현재 윈도우 내 요청 수 조회
   * - EXPIRE: TTL 갱신
   *
   * 원자성 보장을 위해 Lua 스크립트 사용
   */
  private async consumeRedis(
    key: string,
    limit: number,
    windowMs: number,
    now: number,
  ): Promise<RateLimitResult | null> {
    try {
      const redis = await this.cacheService.getRedisClient();
      if (!redis) return null;

      const redisKey = `${this.REDIS_PREFIX}${key}`;
      const windowStart = now - windowMs;
      const windowSeconds = Math.ceil(windowMs / 1000) + 1;

      // Lua 스크립트: 원자적 sliding window 카운터
      // 1. 만료 항목 제거
      // 2. 현재 요청 추가 (score = timestamp)
      // 3. 현재 카운트 반환
      // 4. TTL 갱신
      const luaScript = `
        local key = KEYS[1]
        local now = tonumber(ARGV[1])
        local window_start = tonumber(ARGV[2])
        local ttl = tonumber(ARGV[3])
        local member = ARGV[4]

        redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)
        redis.call('ZADD', key, now, member)
        local count = redis.call('ZCARD', key)
        redis.call('EXPIRE', key, ttl)

        return count
      `;

      // 동일 ms 내 여러 요청을 구분하기 위해 고유 member 사용
      const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;

      const count = await (redis as any).eval(
        luaScript,
        1,
        redisKey,
        String(now),
        String(windowStart),
        String(windowSeconds),
        member,
      ) as number;

      const resetAt = now + windowMs;

      if (count > limit) {
        // 한도 초과: 방금 추가한 항목을 롤백하여 카운트 오염 방지
        await redis.zrem(redisKey, member);
        return {
          allowed: false,
          remaining: 0,
          resetAt,
          retryAfterMs: windowMs,
        };
      }

      return {
        allowed: true,
        remaining: Math.max(limit - count, 0),
        resetAt,
        retryAfterMs: 0,
      };
    } catch (error) {
      this.logger.warn(
        `Redis rate limit failed, falling back to in-memory: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Redis 장애 시 인메모리 Fixed Window 폴백
   */
  private consumeFallback(
    key: string,
    limit: number,
    windowMs: number,
    now: number,
  ): RateLimitResult {
    this.cleanupFallback(now);

    let bucket = this.fallbackBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      this.fallbackBuckets.set(key, bucket);
    }

    if (bucket.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: bucket.resetAt,
        retryAfterMs: Math.max(bucket.resetAt - now, 0),
      };
    }

    bucket.count += 1;

    return {
      allowed: true,
      remaining: Math.max(limit - bucket.count, 0),
      resetAt: bucket.resetAt,
      retryAfterMs: 0,
    };
  }

  /**
   * Gateway에서 사용하는 Rate Limit 체크
   */
  async checkLimit(
    key: string,
    maxRequests: number,
    windowMs: number,
  ): Promise<{ allowed: boolean; remaining: number }> {
    const result = await this.consume(key, maxRequests, windowMs);
    return {
      allowed: result.allowed,
      remaining: result.remaining,
    };
  }

  private cleanupFallback(now: number): void {
    if (now - this.lastCleanup < this.CLEANUP_INTERVAL_MS) {
      return;
    }
    this.lastCleanup = now;
    for (const [key, bucket] of this.fallbackBuckets.entries()) {
      if (bucket.resetAt <= now) {
        this.fallbackBuckets.delete(key);
      }
    }
  }
}
