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

  async getRedisClient(): Promise<Redis | null> {
    if (this.redis) return this.redis;

    try {
      // Redis 연결 설정
      const redisUrl = env.redisUrl || 'redis://localhost:6379';
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        connectTimeout: 3000,
        commandTimeout: 2000,
        enableOfflineQueue: false,
      });

      this.redis.on('connect', () => {
        this.logger.log('🚀 Redis connected successfully');
      });

      this.redis.on('error', (err: Error) => {
        this.logger.warn('⚠️ Redis error, falling back to memory cache:', err.message);
        this.redis = null;
      });

      this.redis.on('close', () => {
        this.logger.warn('🔌 Redis connection closed');
        this.redis = null;
      });

      // 연결 테스트
      await this.redis.ping();
      return this.redis;
    } catch (error) {
      this.logger.warn('📝 Redis unavailable, using memory cache as fallback');
      this.redis = null;
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
        this.logger.warn('Redis get failed, checking fallback cache', error);
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
        this.logger.warn('Redis set failed, using fallback cache', error);
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
        this.logger.warn('Redis del failed', error);
      }
    }

    // Also remove from fallback cache
    const fallbackKey = this.getFallbackCacheKey(key, config.prefix);
    this.fallbackCache.delete(fallbackKey);
  }

  async mget<T>(keys: string[], config: CacheConfig = {}): Promise<(T | null)[]> {
    const redis = await this.getRedisClient();

    if (redis) {
      try {
        const cacheKeys = keys.map(key => config.prefix ? `${config.prefix}:${key}` : key);
        const results = await redis.mget(...cacheKeys);
        return results.map(result => result ? JSON.parse(result) : null);
      } catch (error) {
        this.logger.warn('Redis mget failed, using fallback', error);
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
        this.logger.warn('Redis mset failed, using fallback', error);
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
        this.logger.warn('Redis flush failed', error);
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
}
