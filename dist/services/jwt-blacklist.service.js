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
var JwtBlacklistService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.JwtBlacklistService = void 0;
const common_1 = require("@nestjs/common");
const cacheService_1 = require("./cacheService");
let JwtBlacklistService = JwtBlacklistService_1 = class JwtBlacklistService {
    constructor(cacheService) {
        this.cacheService = cacheService;
        this.logger = new common_1.Logger(JwtBlacklistService_1.name);
        this.BLACKLIST_PREFIX = 'jwt_blacklist:';
        this.USER_TOKENS_PREFIX = 'user_tokens:';
    }
    /**
     * 토큰을 블랙리스트에 추가
     */
    async addToBlacklist(tokenId, userId, expiresAt, reason = 'logout') {
        const ttlSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
        if (ttlSeconds <= 0) {
            this.logger.debug(`Token ${tokenId} already expired, skipping blacklist`);
            return;
        }
        const entry = {
            tokenId,
            userId,
            reason,
            expiresAt,
            blacklistedAt: new Date(),
        };
        try {
            // 블랙리스트에 토큰 추가 (토큰 만료 시간까지만 저장)
            await this.cacheService.set(`${this.BLACKLIST_PREFIX}${tokenId}`, entry, { ttl: ttlSeconds });
            // 사용자별 토큰 목록에도 추가 (관리 목적)
            await this.addToUserTokenList(userId, tokenId, ttlSeconds);
            this.logger.log(`Token blacklisted: ${tokenId} (user: ${userId}, reason: ${reason})`);
        }
        catch (error) {
            this.logger.error(`Failed to blacklist token ${tokenId}:`, error);
            throw error;
        }
    }
    /**
     * 토큰이 블랙리스트에 있는지 확인
     */
    async isBlacklisted(tokenId) {
        try {
            const entry = await this.cacheService.get(`${this.BLACKLIST_PREFIX}${tokenId}`);
            return entry !== null;
        }
        catch (error) {
            this.logger.error(`Failed to check blacklist for token ${tokenId}:`, error);
            // 에러 시 안전을 위해 블랙리스트로 간주
            return true;
        }
    }
    /**
     * 토큰 블랙리스트 정보 조회
     */
    async getBlacklistEntry(tokenId) {
        try {
            return await this.cacheService.get(`${this.BLACKLIST_PREFIX}${tokenId}`);
        }
        catch (error) {
            this.logger.error(`Failed to get blacklist entry for token ${tokenId}:`, error);
            return null;
        }
    }
    /**
     * 사용자의 모든 토큰을 블랙리스트에 추가 (보안 사고 시)
     */
    async blacklistAllUserTokens(userId, reason = 'security') {
        try {
            const userTokens = await this.getUserTokens(userId);
            let blacklistedCount = 0;
            for (const tokenInfo of userTokens) {
                if (!await this.isBlacklisted(tokenInfo.tokenId)) {
                    await this.addToBlacklist(tokenInfo.tokenId, userId, tokenInfo.expiresAt, reason);
                    blacklistedCount++;
                }
            }
            this.logger.warn(`Blacklisted ${blacklistedCount} tokens for user ${userId} (reason: ${reason})`);
            return blacklistedCount;
        }
        catch (error) {
            this.logger.error(`Failed to blacklist all tokens for user ${userId}:`, error);
            throw error;
        }
    }
    /**
     * 사용자별 토큰 목록에 추가
     */
    async addToUserTokenList(userId, tokenId, ttlSeconds) {
        try {
            const userTokensKey = `${this.USER_TOKENS_PREFIX}${userId}`;
            const tokenInfo = {
                tokenId,
                blacklistedAt: new Date(),
                expiresAt: new Date(Date.now() + ttlSeconds * 1000),
            };
            // 기존 토큰 목록 조회
            const existingTokens = await this.cacheService.get(userTokensKey) || [];
            // 새 토큰 추가
            const updatedTokens = [...existingTokens, tokenInfo];
            // 만료된 토큰들 제거 (정리)
            const validTokens = updatedTokens.filter(token => new Date(token.expiresAt) > new Date());
            // 업데이트된 목록 저장
            await this.cacheService.set(userTokensKey, validTokens, { ttl: ttlSeconds });
        }
        catch (error) {
            this.logger.error(`Failed to update user token list for ${userId}:`, error);
            // 이 작업 실패는 주요 기능에 영향을 주지 않으므로 에러를 던지지 않음
        }
    }
    /**
     * 사용자의 토큰 목록 조회
     */
    async getUserTokens(userId) {
        try {
            const userTokensKey = `${this.USER_TOKENS_PREFIX}${userId}`;
            const tokens = await this.cacheService.get(userTokensKey);
            if (!tokens)
                return [];
            // 만료된 토큰들 필터링
            return tokens
                .filter(token => new Date(token.expiresAt) > new Date())
                .map(token => ({
                ...token,
                blacklistedAt: new Date(token.blacklistedAt),
                expiresAt: new Date(token.expiresAt),
            }));
        }
        catch (error) {
            this.logger.error(`Failed to get user tokens for ${userId}:`, error);
            return [];
        }
    }
    /**
     * 블랙리스트 통계 조회
     */
    async getBlacklistStats() {
        try {
            // Redis SCAN을 사용해서 블랙리스트 키들 조회
            const pattern = `${this.BLACKLIST_PREFIX}*`;
            const keys = await this.cacheService.scanKeys(pattern);
            let totalBlacklisted = keys.length;
            let recentBlacklisted = 0;
            const reasons = {};
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            for (const key of keys.slice(0, 100)) { // 성능을 위해 샘플링
                try {
                    const entry = await this.cacheService.get(key);
                    if (entry) {
                        // 최근 1시간 카운트
                        if (new Date(entry.blacklistedAt) > oneHourAgo) {
                            recentBlacklisted++;
                        }
                        // 이유별 통계
                        reasons[entry.reason] = (reasons[entry.reason] || 0) + 1;
                    }
                }
                catch {
                    // 개별 엔트리 조회 실패는 무시
                }
            }
            return {
                totalBlacklisted,
                recentBlacklisted,
                topReasons: reasons,
            };
        }
        catch (error) {
            this.logger.error('Failed to get blacklist stats:', error);
            return {
                totalBlacklisted: 0,
                recentBlacklisted: 0,
                topReasons: {},
            };
        }
    }
    /**
     * 만료된 블랙리스트 엔트리 정리 (선택적, Redis TTL이 자동 처리)
     */
    async cleanupExpiredEntries() {
        try {
            let cleanedCount = 0;
            const pattern = `${this.BLACKLIST_PREFIX}*`;
            const keys = await this.cacheService.scanKeys(pattern);
            for (const key of keys) {
                try {
                    const entry = await this.cacheService.get(key);
                    if (entry && new Date(entry.expiresAt) < new Date()) {
                        await this.cacheService.del(key);
                        cleanedCount++;
                    }
                }
                catch {
                    // 개별 정리 실패는 무시
                }
            }
            if (cleanedCount > 0) {
                this.logger.log(`Cleaned up ${cleanedCount} expired blacklist entries`);
            }
            return cleanedCount;
        }
        catch (error) {
            this.logger.error('Failed to cleanup expired blacklist entries:', error);
            return 0;
        }
    }
};
exports.JwtBlacklistService = JwtBlacklistService;
exports.JwtBlacklistService = JwtBlacklistService = JwtBlacklistService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [cacheService_1.CacheService])
], JwtBlacklistService);
