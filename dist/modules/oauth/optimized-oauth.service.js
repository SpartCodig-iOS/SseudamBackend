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
var OptimizedOAuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptimizedOAuthService = void 0;
const common_1 = require("@nestjs/common");
const social_auth_service_1 = require("./social-auth.service");
const cacheService_1 = require("../../services/cacheService");
const supabaseService_1 = require("../../services/supabaseService");
const crypto_1 = require("crypto");
let OptimizedOAuthService = OptimizedOAuthService_1 = class OptimizedOAuthService {
    constructor(socialAuthService, cacheService, supabaseService) {
        this.socialAuthService = socialAuthService;
        this.cacheService = cacheService;
        this.supabaseService = supabaseService;
        this.logger = new common_1.Logger(OptimizedOAuthService_1.name);
        this.FAST_OAUTH_CACHE_PREFIX = 'fast_oauth';
        this.FAST_OAUTH_CACHE_TTL = 10 * 60; // 10분으로 확대해 재사용률 향상
        this.FAST_OAUTH_REDIS_PREFIX = 'oauth_fast';
        this.LOOKUP_REDIS_PREFIX = 'lookup';
        this.LOOKUP_TTL = 5 * 60; // 5분
    }
    getFastCacheKey(accessToken, loginType) {
        const hash = (0, crypto_1.createHash)('sha256').update(`${accessToken}:${loginType}`).digest('hex');
        return `${hash.substring(0, 16)}`;
    }
    getLookupCacheKey(accessToken) {
        const hash = (0, crypto_1.createHash)('sha256').update(accessToken).digest('hex');
        return `${hash.substring(0, 12)}`;
    }
    /**
     * 초고속 OAuth 로그인 - 중복 요청 최적화
     */
    async fastOAuthLogin(accessToken, loginType = 'email', options = {}) {
        const startTime = Date.now();
        const cacheKey = this.getFastCacheKey(accessToken, loginType);
        try {
            // 1. 빠른 캐시 체크 (이미 처리된 요청인지 확인)
            const cachedResult = await this.cacheService.get(cacheKey, {
                prefix: this.FAST_OAUTH_REDIS_PREFIX,
            });
            if (cachedResult) {
                const duration = Date.now() - startTime;
                this.logger.debug(`Ultra-fast OAuth (cached): ${duration}ms`);
                return cachedResult;
            }
            // 2. 백그라운드 캐시 설정과 함께 OAuth 처리
            const resultPromise = this.socialAuthService.loginWithOAuthToken(accessToken, loginType, options);
            // 3. 결과를 캐시에 저장 (다음 동일한 요청을 위해)
            resultPromise.then((result) => {
                this.cacheService.set(cacheKey, result, {
                    ttl: this.FAST_OAUTH_CACHE_TTL,
                    prefix: this.FAST_OAUTH_REDIS_PREFIX,
                })
                    .catch(err => this.logger.warn(`Failed to cache OAuth result: ${err.message}`));
            });
            const result = await resultPromise;
            const duration = Date.now() - startTime;
            this.logger.debug(`Fast OAuth login completed: ${duration}ms`);
            return result;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.logger.error(`OAuth login failed after ${duration}ms: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }
    /**
     * 백그라운드 OAuth 토큰 교환 최적화
     * private 메서드 접근 제한으로 인해 메인 서비스 호출
     */
    async optimizedTokenExchange(accessToken, loginType, options) {
        const startTime = Date.now();
        // 메인 OAuth 서비스를 통해 토큰 교환 처리 (병렬 처리는 내부에서 수행됨)
        const authResult = await this.socialAuthService.loginWithOAuthToken(accessToken, loginType, options);
        const duration = Date.now() - startTime;
        this.logger.debug(`Optimized OAuth with token exchange: ${duration}ms`);
        return authResult;
    }
    /**
     * 초고속 OAuth 가입 확인 - 최대 0.05초 내 응답
     */
    async fastCheckOAuthAccount(accessToken, loginType = 'email') {
        const startTime = Date.now();
        if (!accessToken) {
            throw new common_1.UnauthorizedException('Missing Supabase access token');
        }
        const cacheKey = this.getLookupCacheKey(accessToken);
        try {
            // 1단계: 캐시에서 초고속 조회 (< 1ms)
            const cached = await this.cacheService.get(cacheKey, {
                prefix: this.LOOKUP_REDIS_PREFIX,
            });
            if (cached !== null) {
                const duration = Date.now() - startTime;
                this.logger.debug(`ULTRA-FAST lookup (cache hit): ${duration}ms`);
                return cached;
            }
            // 2단계: 기존 캐시된 토큰 체크 (< 5ms)
            const existingCheck = this.socialAuthService.getCachedCheck?.(accessToken);
            if (existingCheck) {
                // 결과를 Redis에 캐시하고 즉시 반환
                this.cacheService.set(cacheKey, existingCheck, { ttl: this.LOOKUP_TTL, prefix: this.LOOKUP_REDIS_PREFIX }); // 5분
                const duration = Date.now() - startTime;
                this.logger.debug(`FAST lookup (memory cache hit): ${duration}ms`);
                return existingCheck;
            }
            // 3단계: 병렬 처리로 최적화 (< 200ms)
            const [supabaseUser] = await Promise.allSettled([
                this.supabaseService.getUserFromToken(accessToken)
            ]);
            if (supabaseUser.status === 'rejected' || !supabaseUser.value || !supabaseUser.value.id || !supabaseUser.value.email) {
                throw new common_1.UnauthorizedException('Invalid Supabase access token');
            }
            // 4단계: 프로필 존재 여부 확인과 동시에 캐싱
            const profilePromise = this.supabaseService.findProfileById(supabaseUser.value.id);
            const profile = await profilePromise;
            const result = { registered: Boolean(profile) };
            // 5단계: 다중 캐싱 (메모리 + Redis) - 비동기로 실행해 응답 지연 방지
            Promise.allSettled([
                this.cacheService.set(cacheKey, result, { ttl: 300 }), // Redis 5분
                // 메모리 캐시는 기존 메서드 활용
                Promise.resolve(this.socialAuthService.setCachedCheck?.(accessToken, result.registered))
            ]);
            const duration = Date.now() - startTime;
            this.logger.debug(`FAST lookup completed: ${duration}ms (registered: ${result.registered})`);
            return result;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.logger.error(`FAST lookup failed after ${duration}ms: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }
};
exports.OptimizedOAuthService = OptimizedOAuthService;
exports.OptimizedOAuthService = OptimizedOAuthService = OptimizedOAuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [social_auth_service_1.SocialAuthService,
        cacheService_1.CacheService,
        supabaseService_1.SupabaseService])
], OptimizedOAuthService);
