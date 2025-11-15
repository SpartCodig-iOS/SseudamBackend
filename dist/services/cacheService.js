"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var CacheService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("../config/env");
let CacheService = CacheService_1 = class CacheService {
    constructor() {
        this.logger = new common_1.Logger(CacheService_1.name);
        this.redis = null;
        this.fallbackCache = new Map();
        this.defaultTTL = 300; // 5분
    }
    async getRedisClient() {
        if (this.redis)
            return this.redis;
        try {
            // Redis 연결 설정
            const redisUrl = env_1.env.redisUrl || 'redis://localhost:6379';
            this.redis = new ioredis_1.default(redisUrl, {
                maxRetriesPerRequest: 3,
                connectTimeout: 3000,
                commandTimeout: 2000,
                enableOfflineQueue: false,
            });
            this.redis.on('connect', () => {
                this.logger.log('🚀 Redis connected successfully');
            });
            this.redis.on('error', (err) => {
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
        }
        catch (error) {
            this.logger.warn('📝 Redis unavailable, using memory cache as fallback');
            this.redis = null;
            return null;
        }
    }
    getFallbackCacheKey(key, prefix) {
        return prefix ? `${prefix}:${key}` : key;
    }
    cleanupFallbackCache() {
        const now = Date.now();
        for (const [key, value] of this.fallbackCache.entries()) {
            if (now > value.expiresAt) {
                this.fallbackCache.delete(key);
            }
        }
    }
    async get(key, config = {}) {
        const redis = await this.getRedisClient();
        const cacheKey = config.prefix ? `${config.prefix}:${key}` : key;
        if (redis) {
            try {
                const data = await redis.get(cacheKey);
                if (data) {
                    return JSON.parse(data);
                }
            }
            catch (error) {
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
    async set(key, value, config = {}) {
        const redis = await this.getRedisClient();
        const cacheKey = config.prefix ? `${config.prefix}:${key}` : key;
        const ttl = config.ttl || this.defaultTTL;
        if (redis) {
            try {
                await redis.setex(cacheKey, ttl, JSON.stringify(value));
                return;
            }
            catch (error) {
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
    async del(key, config = {}) {
        const redis = await this.getRedisClient();
        const cacheKey = config.prefix ? `${config.prefix}:${key}` : key;
        if (redis) {
            try {
                await redis.del(cacheKey);
            }
            catch (error) {
                this.logger.warn('Redis del failed', error);
            }
        }
        // Also remove from fallback cache
        const fallbackKey = this.getFallbackCacheKey(key, config.prefix);
        this.fallbackCache.delete(fallbackKey);
    }
    async mget(keys, config = {}) {
        const redis = await this.getRedisClient();
        if (redis) {
            try {
                const cacheKeys = keys.map(key => config.prefix ? `${config.prefix}:${key}` : key);
                const results = await redis.mget(...cacheKeys);
                return results.map(result => result ? JSON.parse(result) : null);
            }
            catch (error) {
                this.logger.warn('Redis mget failed, using fallback', error);
            }
        }
        // Fallback to individual gets
        return Promise.all(keys.map(key => this.get(key, config)));
    }
    async mset(keyValuePairs, config = {}) {
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
            }
            catch (error) {
                this.logger.warn('Redis mset failed, using fallback', error);
            }
        }
        // Fallback to individual sets
        await Promise.all(keyValuePairs.map(({ key, value }) => this.set(key, value, config)));
    }
    async flush(prefix) {
        const redis = await this.getRedisClient();
        if (redis) {
            try {
                if (prefix) {
                    const pattern = `${prefix}:*`;
                    const keys = await redis.keys(pattern);
                    if (keys.length > 0) {
                        await redis.del(...keys);
                    }
                }
                else {
                    await redis.flushdb();
                }
            }
            catch (error) {
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
        }
        else {
            this.fallbackCache.clear();
        }
    }
    async getStats() {
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
            }
            catch (error) {
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
};
exports.CacheService = CacheService;
exports.CacheService = CacheService = CacheService_1 = __decorate([
    (0, common_1.Injectable)()
], CacheService);
