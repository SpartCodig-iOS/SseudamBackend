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
var OptimizedDeleteService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptimizedDeleteService = void 0;
const common_1 = require("@nestjs/common");
const pool_1 = require("../../db/pool");
const supabaseService_1 = require("../../services/supabaseService");
const social_auth_service_1 = require("../oauth/social-auth.service");
const cacheService_1 = require("../../services/cacheService");
let OptimizedDeleteService = OptimizedDeleteService_1 = class OptimizedDeleteService {
    constructor(supabaseService, socialAuthService, cacheService) {
        this.supabaseService = supabaseService;
        this.socialAuthService = socialAuthService;
        this.cacheService = cacheService;
        this.logger = new common_1.Logger(OptimizedDeleteService_1.name);
    }
    /**
     * 초고속 계정 삭제 - 병렬 처리 최적화
     */
    async fastDeleteAccount(user, loginTypeHint) {
        const startTime = Date.now();
        const pool = await (0, pool_1.getPool)();
        try {
            // 1. 사용자 정보를 병렬로 수집 (DB + 캐시)
            const [profileData, cachedTokens] = await Promise.all([
                this.fetchUserProfileData(user.id),
                this.getCachedSocialTokens(user.id)
            ]);
            const loginType = profileData?.login_type || loginTypeHint || 'email';
            const appleRefreshToken = profileData?.apple_refresh_token || cachedTokens?.appleToken;
            const googleRefreshToken = profileData?.google_refresh_token || cachedTokens?.googleToken;
            // 2. 소셜 토큰 해제를 백그라운드에서 처리 (블로킹하지 않음)
            const socialRevokePromise = this.revokeSocialTokensInBackground(user.id, loginType, appleRefreshToken, googleRefreshToken);
            // 3. 로컬 데이터 삭제를 트랜잭션으로 빠르게 처리
            const localDeletePromise = this.performFastLocalDeletion(user.id);
            // 4. Supabase 사용자 삭제를 병렬로 처리
            const supabaseDeletePromise = this.deleteSupabaseUserAsync(user.id);
            // 5. 캐시 무효화를 백그라운드에서 처리
            const cacheCleanupPromise = this.invalidateUserCaches(user.id);
            // 6. 중요한 작업들만 대기 (소셜 해제는 백그라운드)
            const [, supabaseResult] = await Promise.all([
                localDeletePromise,
                supabaseDeletePromise,
                cacheCleanupPromise
            ]);
            // 7. 소셜 토큰 해제는 백그라운드에서 계속 처리
            socialRevokePromise.catch(error => {
                this.logger.warn(`Background social token revocation failed: ${error.message}`);
            });
            const duration = Date.now() - startTime;
            this.logger.debug(`Fast account deletion completed: ${duration}ms`);
            return { supabaseDeleted: supabaseResult };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.logger.error(`Account deletion failed after ${duration}ms: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }
    /**
     * 사용자 프로필 데이터 조회 (최적화된 쿼리)
     */
    async fetchUserProfileData(userId) {
        const pool = await (0, pool_1.getPool)();
        try {
            const result = await pool.query(`SELECT login_type, apple_refresh_token, google_refresh_token
         FROM profiles
         WHERE id = $1 LIMIT 1`, [userId]);
            return result.rows[0] || null;
        }
        catch (error) {
            this.logger.warn(`Failed to fetch profile data: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
        }
    }
    /**
     * 캐시된 소셜 토큰 조회
     */
    async getCachedSocialTokens(userId) {
        try {
            const [appleToken, googleToken] = await Promise.all([
                this.cacheService.get(`apple_token:${userId}`),
                this.cacheService.get(`google_token:${userId}`)
            ]);
            return { appleToken, googleToken };
        }
        catch {
            return { appleToken: null, googleToken: null };
        }
    }
    /**
     * 백그라운드 소셜 토큰 해제 (비블로킹)
     */
    async revokeSocialTokensInBackground(userId, loginType, appleRefreshToken, googleRefreshToken) {
        const revokeTasks = [];
        if (loginType === 'apple' && appleRefreshToken) {
            revokeTasks.push(this.socialAuthService.revokeAppleConnection(userId, appleRefreshToken)
                .catch(error => this.logger.warn(`Apple token revocation failed: ${error.message}`)));
        }
        if (loginType === 'google' && googleRefreshToken) {
            revokeTasks.push(this.socialAuthService.revokeGoogleConnection(userId, googleRefreshToken)
                .catch(error => this.logger.warn(`Google token revocation failed: ${error.message}`)));
        }
        if (revokeTasks.length > 0) {
            return Promise.all(revokeTasks);
        }
    }
    /**
     * 최적화된 로컬 데이터 삭제 (단일 트랜잭션)
     */
    async performFastLocalDeletion(userId) {
        const pool = await (0, pool_1.getPool)();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // 단일 쿼리로 모든 관련 데이터 삭제 (CASCADE 효과 활용)
            await client.query(`
        WITH deleted_expenses AS (
          DELETE FROM travel_expenses WHERE payer_id = $1 RETURNING id
        ),
        deleted_participants AS (
          DELETE FROM travel_expense_participants
          WHERE member_id = $1 OR expense_id IN (SELECT id FROM deleted_expenses)
          RETURNING 1
        ),
        deleted_members AS (
          DELETE FROM travel_members WHERE user_id = $1 RETURNING 1
        ),
        deleted_invites AS (
          DELETE FROM travel_invites WHERE created_by = $1 RETURNING 1
        ),
        deleted_settlements AS (
          DELETE FROM travel_settlements WHERE from_member = $1 OR to_member = $1 RETURNING 1
        ),
        deleted_sessions AS (
          DELETE FROM user_sessions WHERE user_id = $1 RETURNING 1
        )
        DELETE FROM profiles WHERE id = $1
      `, [userId]);
            await client.query('COMMIT');
            this.logger.debug(`Local data deletion completed for user ${userId}`);
        }
        catch (error) {
            await client.query('ROLLBACK');
            this.logger.error(`Local deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
        finally {
            client.release();
        }
    }
    /**
     * Supabase 사용자 삭제 (비동기)
     */
    async deleteSupabaseUserAsync(userId) {
        try {
            await this.supabaseService.deleteUser(userId);
            return true;
        }
        catch (error) {
            this.logger.warn(`Supabase user deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }
    /**
     * 사용자 관련 모든 캐시 무효화
     */
    async invalidateUserCaches(userId) {
        try {
            // 사용자 관련 캐시 패턴들을 병렬로 삭제
            await Promise.all([
                this.cacheService.delPattern(`profile:${userId}`),
                this.cacheService.delPattern(`auth:${userId}:*`),
                this.cacheService.delPattern(`oauth:*:${userId}`),
                this.cacheService.delPattern(`session:${userId}:*`),
                this.cacheService.delPattern(`travel:user:${userId}:*`),
                this.cacheService.delPattern(`fast_oauth:*:${userId}`)
            ]);
            this.logger.debug(`Cache invalidation completed for user ${userId}`);
        }
        catch (error) {
            this.logger.warn(`Cache invalidation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
};
exports.OptimizedDeleteService = OptimizedDeleteService;
exports.OptimizedDeleteService = OptimizedDeleteService = OptimizedDeleteService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [supabaseService_1.SupabaseService,
        social_auth_service_1.SocialAuthService,
        cacheService_1.CacheService])
], OptimizedDeleteService);
