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
            const avatarUrl = profileData?.avatar_url || user.avatar_url || null;
            const loginType = profileData?.login_type || loginTypeHint || 'email';
            const appleRefreshToken = profileData?.apple_refresh_token || cachedTokens?.appleToken;
            const googleRefreshToken = profileData?.google_refresh_token || cachedTokens?.googleToken;
            // 2. 소셜 토큰 해제를 백그라운드에서 처리 (블로킹하지 않음)
            const socialRevokePromise = this.revokeSocialTokensInBackground(user.id, loginType, appleRefreshToken, googleRefreshToken);
            // 3. 로컬 데이터 삭제를 트랜잭션으로 빠르게 처리
            const localDeletePromise = this.performFastLocalDeletion(user.id);
            // 4. Supabase 사용자 삭제 (auth only)
            const supabaseDeletePromise = this.deleteSupabaseUserAsync(user.id);
            // 5. 프로필 이미지 삭제 (스토리지)
            const profileImageDeletePromise = this.supabaseService.deleteProfileImage(avatarUrl)
                .catch(error => this.logger.warn(`Profile image deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
            // 6. 캐시 무효화: 로컬 삭제 완료 후 해당 여행/사용자 캐시 제거
            const cacheCleanupPromise = localDeletePromise.then(travelIds => this.invalidateUserCaches(user.id, travelIds));
            // 7. 중요한 작업들만 대기 (소셜 해제는 백그라운드)
            const [supabaseResult] = await Promise.all([
                supabaseDeletePromise,
                cacheCleanupPromise,
                profileImageDeletePromise
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
            const result = await pool.query(`SELECT login_type, apple_refresh_token, google_refresh_token, avatar_url
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
            // 소유한 여행 ID를 먼저 수집 (캐시 무효화용)
            const targetTravelsResult = await client.query('SELECT id::text FROM travels WHERE owner_id = $1', [userId]);
            const targetTravelIds = targetTravelsResult.rows.map((r) => r.id);
            const travelIdArray = targetTravelIds.length > 0 ? targetTravelIds : [];
            // 단일 쿼리로 모든 관련 데이터 삭제 (사용자가 소유한 여행까지 함께 정리)
            await client.query(`
        WITH deleted_expenses AS (
          DELETE FROM travel_expenses
          WHERE payer_id = $1 OR travel_id = ANY($2::uuid[])
          RETURNING id
        ),
        deleted_participants AS (
          DELETE FROM travel_expense_participants
          WHERE member_id = $1
             OR expense_id IN (SELECT id FROM deleted_expenses)
          RETURNING 1
        ),
        deleted_settlements AS (
          DELETE FROM travel_settlements
          WHERE from_member = $1 OR to_member = $1 OR travel_id = ANY($2::uuid[])
          RETURNING 1
        ),
        deleted_invites AS (
          DELETE FROM travel_invites
          WHERE created_by = $1 OR travel_id = ANY($2::uuid[])
          RETURNING 1
        ),
        deleted_members AS (
          DELETE FROM travel_members
          WHERE user_id = $1 OR travel_id = ANY($2::uuid[])
          RETURNING 1
        )
        DELETE FROM travels WHERE id = ANY($2::uuid[]);

      -- 여행 없는 경우에도 사용자 관련 잔여 데이터 제거 후 프로필 삭제
      WITH deleted_sessions AS (
        DELETE FROM user_sessions WHERE user_id = $1 RETURNING 1
      ),
      deleted_invites AS (
        DELETE FROM travel_invites WHERE created_by = $1 RETURNING 1
      ),
      deleted_members AS (
        DELETE FROM travel_members WHERE user_id = $1 RETURNING 1
      ),
      deleted_settlements AS (
        DELETE FROM travel_settlements WHERE from_member = $1 OR to_member = $1 RETURNING 1
      ),
      deleted_expenses AS (
        DELETE FROM travel_expenses WHERE payer_id = $1 RETURNING id
      ),
      deleted_participants AS (
        DELETE FROM travel_expense_participants WHERE member_id = $1 RETURNING 1
      )
      DELETE FROM profiles WHERE id = $1
      `, [userId, travelIdArray]);
            await client.query('COMMIT');
            this.logger.debug(`Local data deletion completed for user ${userId}`);
            return travelIdArray;
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
    async invalidateUserCaches(userId, travelIds = []) {
        try {
            const travelIdsUnique = Array.from(new Set(travelIds)).filter(Boolean);
            // 사용자 관련 캐시 패턴들을 병렬로 삭제
            const baseTasks = [
                this.cacheService.delPattern(`profile:${userId}`),
                this.cacheService.delPattern(`auth:${userId}:*`),
                this.cacheService.delPattern(`oauth:*:${userId}`),
                this.cacheService.delPattern(`session:${userId}:*`),
                this.cacheService.delPattern(`travel:user:${userId}:*`),
                this.cacheService.delPattern(`fast_oauth:*:${userId}`),
                // 여행 목록 캐시 (user 별)
                this.cacheService.delPattern(`travel:list:${userId}:*`),
                // 멤버십 캐시 (travelId:userId 형태)
                this.cacheService.delPattern(`travel:member:*:${userId}`),
            ];
            const travelTasks = travelIdsUnique.flatMap((travelId) => [
                // 여행 상세 캐시
                this.cacheService.del(travelId, { prefix: 'travel:detail' }).catch(() => undefined),
                // 멤버 목록 캐시
                this.cacheService.del(travelId, { prefix: 'travel:members' }).catch(() => undefined),
                // 멤버십 캐시 (travelId:userId 형태) 전부 제거
                this.cacheService.delPattern(`travel:member:${travelId}:*`).catch(() => undefined),
                // 초대 캐시 (invite는 코드 기반이라 travelId별 패턴은 없지만, 안전하게 전체 삭제)
                this.cacheService.delPattern(`travel:invite:*`).catch(() => undefined),
                // 정산/지출 관련 캐시
                this.cacheService.del(travelId, { prefix: 'settlement:summary' }).catch(() => undefined),
                this.cacheService.delPattern(`expense:list:${travelId}:*`).catch(() => undefined),
                this.cacheService.delPattern(`expense:detail:${travelId}:*`).catch(() => undefined),
            ]);
            await Promise.all([...baseTasks, ...travelTasks]);
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
