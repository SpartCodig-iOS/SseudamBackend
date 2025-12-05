import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from '../config/env';

export interface CacheConfig {
  ttl?: number; // TTL in seconds
  prefix?: string;
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis | null = null;
  private fallbackCache = new Map<string, { data: any; expiresAt: number }>();
  private readonly defaultTTL = 300; // 5분
  private readonly redisUrl = env.redisUrl;
  private redisConfigLogged = false;
  private redisFailureCount = 0;
  private redisNextRetryAt = 0;
  private readonly redisCooldownMs = 30_000;
  private redisKeepAliveTimer: NodeJS.Timeout | null = null;
  private readonly redisKeepAliveMs = 20_000; // 20초 간격 ping으로 sleep 방지

  async getRedisClient(): Promise<Redis | null> {
    if (!this.redisUrl) {
      if (!this.redisConfigLogged) {
        this.logger.log('🪣 Redis URL not configured - using in-memory cache only');
        this.redisConfigLogged = true;
      }
      return null;
    }

    const now = Date.now();
    if (now < this.redisNextRetryAt) {
      return null;
    }

    if (this.redis) return this.redis;

    try {
      // Redis 연결 설정 (성능 최적화)
      this.redis = new Redis(this.redisUrl, {
        maxRetriesPerRequest: 1,      // 재시도 최소화로 지연 방지
        connectTimeout: 800,          // 연결 타임아웃 단축 (1000ms → 800ms)
        commandTimeout: 400,          // 명령 타임아웃 단축 (500ms → 400ms)
        enableOfflineQueue: false,
        lazyConnect: true,            // 필요시에만 연결
        keepAlive: 30000,             // 30초마다 keep-alive
        maxLoadingRetryTime: 5000,    // 로딩 타임아웃
      });

      this.redis.on('connect', () => {
        this.logger.log('🚀 Redis connected successfully');
        // Sleep 방지용 keep-alive
        if (this.redisKeepAliveTimer) {
          clearInterval(this.redisKeepAliveTimer);
        }
        this.redisKeepAliveTimer = setInterval(() => {
          if (!this.redis) return;
          this.redis.ping().catch((err) => {
            this.logger.warn(`Redis keep-alive ping failed: ${err.message}`);
          });
        }, this.redisKeepAliveMs);
      });

      this.redis.on('error', (err: Error) => {
        this.logger.warn(`⚠️ Redis error, falling back to memory cache (${err.message})`);
        this.redis = null;
        this.redisFailureCount += 1;
        this.redisNextRetryAt = Date.now() + Math.min(this.redisCooldownMs * this.redisFailureCount, 5 * this.redisCooldownMs);
        if (this.redisKeepAliveTimer) {
          clearInterval(this.redisKeepAliveTimer);
          this.redisKeepAliveTimer = null;
        }
      });

      this.redis.on('close', () => {
        this.logger.warn('🔌 Redis connection closed');
        this.redis = null;
        this.redisFailureCount += 1;
        this.redisNextRetryAt = Date.now() + Math.min(this.redisCooldownMs * this.redisFailureCount, 5 * this.redisCooldownMs);
        if (this.redisKeepAliveTimer) {
          clearInterval(this.redisKeepAliveTimer);
          this.redisKeepAliveTimer = null;
        }
      });

      // 연결 테스트
      await this.redis.ping();
      this.redisFailureCount = 0;
      this.redisNextRetryAt = 0;
      return this.redis;
    } catch (error) {
      this.logger.warn('📝 Redis unavailable, using memory cache as fallback');
      this.redis = null;
      this.redisFailureCount += 1;
      this.redisNextRetryAt = Date.now() + Math.min(this.redisCooldownMs * this.redisFailureCount, 5 * this.redisCooldownMs);
      return null;
    }
  }

  private getFallbackCacheKey(key: string, prefix?: string): string {
    return prefix ? `${prefix}:${key}` : key;
  }

  private cleanupFallbackCache(): void {
    const now = Date.now();
    for (const [key, value] of this.fallbackCache.entries()) {
      if (now > value.expiresAt) {
        this.fallbackCache.delete(key);
      }
    }
  }

  async get<T>(key: string, config: CacheConfig = {}): Promise<T | null> {
    const redis = await this.getRedisClient();
    const cacheKey = config.prefix ? `${config.prefix}:${key}` : key;

    if (redis) {
      try {
        const data = await redis.get(cacheKey);
        if (data) {
          return JSON.parse(data);
        }
      } catch (error) {
        this.logger.warn(`Redis get failed, checking fallback cache (${this.stringifyError(error)})`);
      }
    }

    // Fallback to memory cache
    const fallbackKey = this.getFallbackCacheKey(key, config.prefix);
    const cached = this.fallbackCache.get(fallbackKey);
    if (cached && Date.now() <= cached.expiresAt) {
      return cached.data;
    }

    return null;
  }

  async set<T>(key: string, value: T, config: CacheConfig = {}): Promise<void> {
    const redis = await this.getRedisClient();
    const cacheKey = config.prefix ? `${config.prefix}:${key}` : key;
    const ttl = config.ttl || this.defaultTTL;

    if (redis) {
      try {
        await redis.setex(cacheKey, ttl, JSON.stringify(value));
        return;
      } catch (error) {
        this.logger.warn(`Redis set failed, using fallback cache (${this.stringifyError(error)})`);
      }
    }

    // Fallback to memory cache
    const fallbackKey = this.getFallbackCacheKey(key, config.prefix);
    this.fallbackCache.set(fallbackKey, {
      data: value,
      expiresAt: Date.now() + (ttl * 1000),
    });

    // Cleanup every 100 operations
    if (this.fallbackCache.size % 100 === 0) {
      this.cleanupFallbackCache();
    }
  }

  async del(key: string, config: CacheConfig = {}): Promise<void> {
    const redis = await this.getRedisClient();
    const cacheKey = config.prefix ? `${config.prefix}:${key}` : key;

    if (redis) {
      try {
        await redis.del(cacheKey);
      } catch (error) {
        this.logger.warn(`Redis del failed (${this.stringifyError(error)})`);
      }
    }

    // Also remove from fallback cache
    const fallbackKey = this.getFallbackCacheKey(key, config.prefix);
    this.fallbackCache.delete(fallbackKey);
  }

  /**
   * 패턴 기반 캐시 무효화
   * 예: delPattern('user:*') - 모든 user 관련 캐시 삭제
   */
  async delPattern(pattern: string): Promise<number> {
    const redis = await this.getRedisClient();
    let deletedCount = 0;

    if (redis) {
      try {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          deletedCount = await redis.del(...keys);
          this.logger.debug(`Deleted ${deletedCount} keys matching pattern: ${pattern}`);
        }
      } catch (error) {
        this.logger.warn(`Redis pattern delete failed (${this.stringifyError(error)})`);
      }
    }

    // Fallback cache pattern cleanup
    const fallbackKeys = Array.from(this.fallbackCache.keys()).filter(key =>
      this.matchPattern(key, pattern)
    );
    fallbackKeys.forEach(key => this.fallbackCache.delete(key));

    return deletedCount + fallbackKeys.length;
  }

  /**
   * 태그 기반 캐시 무효화
   * 사용자 관련 모든 캐시를 한번에 무효화할 때 유용
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    let totalDeleted = 0;

    for (const tag of tags) {
      const deleted = await this.delPattern(`*:${tag}:*`);
      totalDeleted += deleted;
    }

    this.logger.debug(`Invalidated ${totalDeleted} cache entries for tags: ${tags.join(', ')}`);
    return totalDeleted;
  }

  /**
   * 사용자별 캐시 완전 무효화
   * 프로필 수정, 탈퇴 등에 사용
   */
  async invalidateUserCache(userId: string): Promise<void> {
    const patterns = [
      `user:${userId}`,           // 사용자 기본 정보
      `profile:${userId}`,        // 프로필 캐시
      `profile:${userId}:*`,
      `avatar:${userId}`,         // 아바타 캐시
      `avatar:${userId}:*`,
      `auth:${userId}:*`,         // 인증 관련 캐시
      `oauth:user-index:${userId}`, // OAuth 토큰 인덱스
      `travel:user:${userId}:*`,  // 여행 관련 캐시
      `session:${userId}:*`,      // 세션 관련 캐시
    ];

    let totalDeleted = 0;
    for (const pattern of patterns) {
      totalDeleted += await this.delPattern(pattern);
    }

    this.logger.debug(`Invalidated ${totalDeleted} cache entries for user ${userId}`);
  }

  /**
   * 여행별 캐시 무효화
   * 여행 정보 수정, 멤버 추가/제거 등에 사용
   */
  async invalidateTravelCache(travelId: string): Promise<void> {
    const patterns = [
      `travel:${travelId}`,       // 여행 기본 정보
      `travel:${travelId}:*`,     // 여행 관련 모든 하위 캐시
      `expense:${travelId}:*`,    // 비용 관련 캐시
      `settlement:${travelId}:*`, // 정산 관련 캐시
      `members:${travelId}`,      // 멤버 목록 캐시
    ];

    let totalDeleted = 0;
    for (const pattern of patterns) {
      totalDeleted += await this.delPattern(pattern);
    }

    this.logger.debug(`Invalidated ${totalDeleted} cache entries for travel ${travelId}`);
  }

  async mget<T>(keys: string[], config: CacheConfig = {}): Promise<(T | null)[]> {
    const redis = await this.getRedisClient();

    if (redis) {
      try {
        const cacheKeys = keys.map(key => config.prefix ? `${config.prefix}:${key}` : key);
        const results = await redis.mget(...cacheKeys);
        return results.map(result => result ? JSON.parse(result) : null);
      } catch (error) {
        this.logger.warn(`Redis mget failed, using fallback (${this.stringifyError(error)})`);
      }
    }

    // Fallback to individual gets
    return Promise.all(keys.map(key => this.get<T>(key, config)));
  }

  async mset<T>(keyValuePairs: { key: string; value: T }[], config: CacheConfig = {}): Promise<void> {
    const redis = await this.getRedisClient();
    const ttl = config.ttl || this.defaultTTL;

    if (redis) {
      try {
        const pipeline = redis.pipeline();
        keyValuePairs.forEach(({ key, value }) => {
          const cacheKey = config.prefix ? `${config.prefix}:${key}` : key;
          pipeline.setex(cacheKey, ttl, JSON.stringify(value));
        });
        await pipeline.exec();
        return;
      } catch (error) {
        this.logger.warn(`Redis mset failed, using fallback (${this.stringifyError(error)})`);
      }
    }

    // Fallback to individual sets
    await Promise.all(keyValuePairs.map(({ key, value }) =>
      this.set(key, value, config)
    ));
  }

  async flush(prefix?: string): Promise<void> {
    const redis = await this.getRedisClient();

    if (redis) {
      try {
        if (prefix) {
          const pattern = `${prefix}:*`;
          const keys = await redis.keys(pattern);
          if (keys.length > 0) {
            await redis.del(...keys);
          }
        } else {
          await redis.flushdb();
        }
      } catch (error) {
        this.logger.warn(`Redis flush failed (${this.stringifyError(error)})`);
      }
    }

    // Also clear fallback cache
    if (prefix) {
      for (const key of this.fallbackCache.keys()) {
        if (key.startsWith(`${prefix}:`)) {
          this.fallbackCache.delete(key);
        }
      }
    } else {
      this.fallbackCache.clear();
    }
  }

  async getStats(): Promise<{ redis: any; fallback: any }> {
    const redis = await this.getRedisClient();
    let redisStats = null;

    if (redis) {
      try {
        const info = await redis.info();
        redisStats = {
          connected: redis.status === 'ready',
          memory: info.includes('used_memory_human') ? info.match(/used_memory_human:(.+)/)?.[1] : 'unknown',
          clients: info.includes('connected_clients') ? info.match(/connected_clients:(\d+)/)?.[1] : 'unknown',
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown';
        redisStats = { error: message };
      }
    }

    return {
      redis: redisStats,
      fallback: {
        size: this.fallbackCache.size,
        keys: Array.from(this.fallbackCache.keys()).slice(0, 10), // First 10 keys for debugging
      },
    };
  }

  /**
   * 와일드카드 패턴 매칭 헬퍼
   * Redis KEYS 명령어 스타일의 패턴 매칭
   */
  private matchPattern(key: string, pattern: string): boolean {
    // * 를 .* 로 변환하여 정규식으로 변환
    const regexPattern = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // 특수문자 이스케이프
      .replace(/\\\*/g, '.*'); // \* 를 .* 로 변환

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(key);
  }

  private stringifyError(error: unknown): string {
    if (!error) return 'unknown error';
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
}
