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
const crypto_1 = require("crypto");
let OptimizedOAuthService = OptimizedOAuthService_1 = class OptimizedOAuthService {
    constructor(socialAuthService, cacheService) {
        this.socialAuthService = socialAuthService;
        this.cacheService = cacheService;
        this.logger = new common_1.Logger(OptimizedOAuthService_1.name);
        this.FAST_OAUTH_CACHE_PREFIX = 'fast_oauth';
        this.FAST_OAUTH_CACHE_TTL = 2 * 60; // 2분
    }
    getFastCacheKey(accessToken, loginType) {
        const hash = (0, crypto_1.createHash)('sha256').update(`${accessToken}:${loginType}`).digest('hex');
        return `${this.FAST_OAUTH_CACHE_PREFIX}:${hash.substring(0, 16)}`;
    }
    /**
     * 초고속 OAuth 로그인 - 중복 요청 최적화
     */
    async fastOAuthLogin(accessToken, loginType = 'email', options = {}) {
        const startTime = Date.now();
        const cacheKey = this.getFastCacheKey(accessToken, loginType);
        try {
            // 1. 빠른 캐시 체크 (이미 처리된 요청인지 확인)
            const cachedResult = await this.cacheService.get(cacheKey);
            if (cachedResult) {
                const duration = Date.now() - startTime;
                this.logger.debug(`Ultra-fast OAuth (cached): ${duration}ms`);
                return cachedResult;
            }
            // 2. 백그라운드 캐시 설정과 함께 OAuth 처리
            const resultPromise = this.socialAuthService.loginWithOAuthToken(accessToken, loginType, options);
            // 3. 결과를 캐시에 저장 (다음 동일한 요청을 위해)
            resultPromise.then((result) => {
                this.cacheService.set(cacheKey, result, { ttl: this.FAST_OAUTH_CACHE_TTL })
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
};
exports.OptimizedOAuthService = OptimizedOAuthService;
exports.OptimizedOAuthService = OptimizedOAuthService = OptimizedOAuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [social_auth_service_1.SocialAuthService,
        cacheService_1.CacheService])
], OptimizedOAuthService);
