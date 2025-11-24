"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var OptimizedJwtTokenService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptimizedJwtTokenService = void 0;
const common_1 = require("@nestjs/common");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = require("crypto");
const env_1 = require("../config/env");
const cacheService_1 = require("./cacheService");
const secondsToMs = (value) => value * 1000;
let OptimizedJwtTokenService = OptimizedJwtTokenService_1 = class OptimizedJwtTokenService {
    constructor(cacheService) {
        this.cacheService = cacheService;
        this.logger = new common_1.Logger(OptimizedJwtTokenService_1.name);
        this.TOKEN_CACHE_PREFIX = 'jwt_token';
        this.TOKEN_CACHE_TTL = 5 * 60; // 5분
        this.INVALID_TOKEN_CACHE_TTL = 60; // 1분 (잘못된 토큰은 짧게 캐시)
        // 메모리 기반 토큰 캐시 (Redis 장애 시 fallback)
        this.tokenCache = new Map();
        this.MAX_MEMORY_CACHE_SIZE = 10000;
        // Railway Sleep 모드 지원: 개발환경 또는 RAILWAY_SLEEP_MODE에서는 백그라운드 캐시 정리 비활성화
        if (process.env.NODE_ENV === 'production' && process.env.RAILWAY_SLEEP_MODE !== 'true') {
            // 운영환경에서만 2시간마다 캐시 정리
            const cleanupInterval = 2 * 60 * 60 * 1000; // 2시간
            setInterval(() => {
                this.cleanupMemoryCache();
            }, cleanupInterval);
        }
        this.logger.log('JWT background cache cleanup disabled for Railway Sleep mode support');
    }
    createAccessPayload(user, sessionId, loginType) {
        return {
            sub: user.id,
            email: user.email,
            name: user.name ?? undefined,
            loginType,
            lastLoginAt: new Date().toISOString(),
            role: user.role,
            sessionId,
        };
    }
    createRefreshPayload(user, sessionId) {
        return {
            sub: user.id,
            typ: 'refresh',
            sessionId,
        };
    }
    getTokenCacheKey(token) {
        // 토큰의 해시를 키로 사용 (보안 + 메모리 효율)
        return (0, crypto_1.createHash)('sha256').update(token).digest('hex').substring(0, 16);
    }
    async getCachedToken(token) {
        const cacheKey = this.getTokenCacheKey(token);
        try {
            // 1. Redis 캐시 확인
            const cached = await this.cacheService.get(cacheKey, {
                prefix: this.TOKEN_CACHE_PREFIX,
            });
            if (cached) {
                return cached;
            }
            // 2. 메모리 캐시 확인 (fallback)
            const memoryCached = this.tokenCache.get(cacheKey);
            if (memoryCached && Date.now() - memoryCached.cached_at < this.TOKEN_CACHE_TTL * 1000) {
                return memoryCached;
            }
            return null;
        }
        catch (error) {
            this.logger.warn(`Token cache read failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            // 메모리 캐시 fallback
            const memoryCached = this.tokenCache.get(cacheKey);
            if (memoryCached && Date.now() - memoryCached.cached_at < this.TOKEN_CACHE_TTL * 1000) {
                return memoryCached;
            }
            return null;
        }
    }
    async setCachedToken(token, data) {
        const cacheKey = this.getTokenCacheKey(token);
        const ttl = data.isValid ? this.TOKEN_CACHE_TTL : this.INVALID_TOKEN_CACHE_TTL;
        try {
            // Redis 캐시 저장
            await this.cacheService.set(cacheKey, data, {
                prefix: this.TOKEN_CACHE_PREFIX,
                ttl,
            });
        }
        catch (error) {
            this.logger.warn(`Token cache write failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        // 메모리 캐시 저장 (항상)
        if (this.tokenCache.size >= this.MAX_MEMORY_CACHE_SIZE) {
            this.cleanupMemoryCache();
        }
        this.tokenCache.set(cacheKey, {
            ...data,
            cached_at: Date.now(),
        });
    }
    cleanupMemoryCache() {
        const now = Date.now();
        const expiredKeys = [];
        for (const [key, data] of this.tokenCache.entries()) {
            if (now - data.cached_at > this.TOKEN_CACHE_TTL * 1000) {
                expiredKeys.push(key);
            }
        }
        for (const key of expiredKeys) {
            this.tokenCache.delete(key);
        }
        // 크기가 여전히 크면 오래된 순으로 정리
        if (this.tokenCache.size > this.MAX_MEMORY_CACHE_SIZE * 0.8) {
            const entries = Array.from(this.tokenCache.entries())
                .sort((a, b) => a[1].cached_at - b[1].cached_at)
                .slice(0, Math.floor(this.MAX_MEMORY_CACHE_SIZE * 0.3));
            for (const [key] of entries) {
                this.tokenCache.delete(key);
            }
        }
        if (expiredKeys.length > 0 || this.tokenCache.size > this.MAX_MEMORY_CACHE_SIZE * 0.8) {
            this.logger.debug(`Memory cache cleanup: removed ${expiredKeys.length} expired tokens, current size: ${this.tokenCache.size}`);
        }
    }
    async generateTokenPair(user, loginType) {
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        // 병렬로 토큰 생성
        const [accessToken, refreshToken] = await Promise.all([
            this.generateAccessTokenAsync(user, sessionId, loginType),
            this.generateRefreshTokenAsync(user, sessionId),
        ]);
        const accessTokenExpiresAt = new Date(Date.now() + secondsToMs(3600)); // 1시간
        const refreshTokenExpiresAt = new Date(Date.now() + secondsToMs(86400 * 7)); // 7일
        return {
            accessToken,
            accessTokenExpiresAt,
            refreshToken,
            refreshTokenExpiresAt,
        };
    }
    async generateAccessTokenAsync(user, sessionId, loginType) {
        return new Promise((resolve, reject) => {
            const payload = this.createAccessPayload(user, sessionId, loginType);
            jsonwebtoken_1.default.sign(payload, env_1.env.jwtSecret, {
                expiresIn: `${env_1.env.accessTokenTTL}s`,
                issuer: 'sseduam-api',
                audience: 'sseduam-app',
            }, (err, token) => {
                if (err || !token) {
                    reject(err || new Error('Token generation failed'));
                }
                else {
                    resolve(token);
                }
            });
        });
    }
    async generateRefreshTokenAsync(user, sessionId) {
        return new Promise((resolve, reject) => {
            const payload = this.createRefreshPayload(user, sessionId);
            jsonwebtoken_1.default.sign(payload, env_1.env.jwtSecret, {
                expiresIn: `${env_1.env.refreshTokenTTL}s`,
                issuer: 'sseduam-api',
                audience: 'sseduam-app',
            }, (err, token) => {
                if (err || !token) {
                    reject(err || new Error('Refresh token generation failed'));
                }
                else {
                    resolve(token);
                }
            });
        });
    }
    async verifyAccessToken(token) {
        // 캐시 확인
        const cached = await this.getCachedToken(token);
        if (cached) {
            if (!cached.isValid) {
                return null;
            }
            return cached.payload;
        }
        // 캐시 미스 - 토큰 검증
        try {
            const startTime = process.hrtime.bigint();
            const payload = await new Promise((resolve, reject) => {
                jsonwebtoken_1.default.verify(token, env_1.env.jwtSecret, {
                    issuer: 'sseduam-api',
                    audience: 'sseduam-app',
                }, (err, decoded) => {
                    if (err || !decoded || typeof decoded === 'string') {
                        reject(err || new Error('Invalid token'));
                    }
                    else {
                        const accessPayload = decoded;
                        if (accessPayload.typ === 'refresh') {
                            reject(new Error('Refresh token provided instead of access token'));
                        }
                        else {
                            resolve(accessPayload);
                        }
                    }
                });
            });
            const endTime = process.hrtime.bigint();
            const durationMs = Number(endTime - startTime) / 1000000;
            // 성공한 검증 결과 캐시
            await this.setCachedToken(token, {
                payload,
                isValid: true,
                cached_at: Date.now(),
            });
            // 느린 토큰 검증 로깅
            if (durationMs > 10) {
                this.logger.warn(`Slow token verification: ${durationMs.toFixed(2)}ms`);
            }
            return payload;
        }
        catch (error) {
            // 실패한 검증 결과도 짧게 캐시 (동일한 잘못된 토큰의 반복 검증 방지)
            await this.setCachedToken(token, {
                payload: {},
                isValid: false,
                cached_at: Date.now(),
            });
            this.logger.debug(`Token verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
        }
    }
    async verifyRefreshToken(token) {
        // 캐시 확인
        const cached = await this.getCachedToken(token);
        if (cached) {
            if (!cached.isValid) {
                return null;
            }
            const payload = cached.payload;
            if (payload.typ === 'refresh') {
                return payload;
            }
        }
        // 캐시 미스 - 토큰 검증
        try {
            const payload = await new Promise((resolve, reject) => {
                jsonwebtoken_1.default.verify(token, env_1.env.jwtSecret, {
                    issuer: 'sseduam-api',
                    audience: 'sseduam-app',
                }, (err, decoded) => {
                    if (err || !decoded || typeof decoded === 'string') {
                        reject(err || new Error('Invalid token'));
                    }
                    else {
                        const refreshPayload = decoded;
                        if (refreshPayload.typ !== 'refresh') {
                            reject(new Error('Access token provided instead of refresh token'));
                        }
                        else {
                            resolve(refreshPayload);
                        }
                    }
                });
            });
            // 성공한 검증 결과 캐시
            await this.setCachedToken(token, {
                payload,
                isValid: true,
                cached_at: Date.now(),
            });
            return payload;
        }
        catch (error) {
            // 실패한 검증 결과도 짧게 캐시
            await this.setCachedToken(token, {
                payload: {},
                isValid: false,
                cached_at: Date.now(),
            });
            this.logger.debug(`Refresh token verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
        }
    }
    // 토큰 무효화 (로그아웃 시 사용)
    async invalidateToken(token) {
        const cacheKey = this.getTokenCacheKey(token);
        try {
            // Redis에서 삭제
            await this.cacheService.del(cacheKey, { prefix: this.TOKEN_CACHE_PREFIX });
        }
        catch (error) {
            this.logger.warn(`Token cache invalidation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        // 메모리 캐시에서도 삭제
        this.tokenCache.delete(cacheKey);
    }
    // 사용자의 모든 토큰 무효화
    async invalidateUserTokens(userId) {
        // 패턴 기반 삭제는 Redis에서만 가능
        try {
            await this.cacheService.delPattern(`${this.TOKEN_CACHE_PREFIX}:*`);
            this.logger.debug(`Invalidated all cached tokens for security`);
        }
        catch (error) {
            this.logger.warn(`Bulk token invalidation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        // 메모리 캐시 전체 클리어 (보안상 안전)
        this.tokenCache.clear();
    }
    // 캐시 통계
    getCacheStats() {
        return {
            memoryCacheSize: this.tokenCache.size,
            maxMemoryCacheSize: this.MAX_MEMORY_CACHE_SIZE,
            memoryCacheUtilization: (this.tokenCache.size / this.MAX_MEMORY_CACHE_SIZE * 100).toFixed(1) + '%',
        };
    }
};
exports.OptimizedJwtTokenService = OptimizedJwtTokenService;
exports.OptimizedJwtTokenService = OptimizedJwtTokenService = OptimizedJwtTokenService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [cacheService_1.CacheService])
], OptimizedJwtTokenService);
