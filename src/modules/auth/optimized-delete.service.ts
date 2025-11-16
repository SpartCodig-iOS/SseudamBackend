import { Injectable, Logger } from '@nestjs/common';
import { UserRecord } from '../../types/user';
import { LoginType } from '../../types/auth';
import { getPool } from '../../db/pool';
import { SupabaseService } from '../../services/supabaseService';
import { SocialAuthService } from '../oauth/social-auth.service';
import { CacheService } from '../../services/cacheService';

@Injectable()
export class OptimizedDeleteService {
  private readonly logger = new Logger(OptimizedDeleteService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly socialAuthService: SocialAuthService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * 초고속 계정 삭제 - 병렬 처리 최적화
   */
  async fastDeleteAccount(
    user: UserRecord,
    loginTypeHint?: LoginType
  ): Promise<{ supabaseDeleted: boolean }> {
    const startTime = Date.now();
    const pool = await getPool();

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
      const socialRevokePromise = this.revokeSocialTokensInBackground(
        user.id,
        loginType,
        appleRefreshToken,
        googleRefreshToken
      );

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

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Account deletion failed after ${duration}ms: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * 사용자 프로필 데이터 조회 (최적화된 쿼리)
   */
  private async fetchUserProfileData(userId: string) {
    const pool = await getPool();
    try {
      const result = await pool.query(
        `SELECT login_type, apple_refresh_token, google_refresh_token
         FROM profiles
         WHERE id = $1 LIMIT 1`,
        [userId]
      );
      return result.rows[0] || null;
    } catch (error) {
      this.logger.warn(`Failed to fetch profile data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  /**
   * 캐시된 소셜 토큰 조회
   */
  private async getCachedSocialTokens(userId: string) {
    try {
      const [appleToken, googleToken] = await Promise.all([
        this.cacheService.get<string>(`apple_token:${userId}`),
        this.cacheService.get<string>(`google_token:${userId}`)
      ]);
      return { appleToken, googleToken };
    } catch {
      return { appleToken: null, googleToken: null };
    }
  }

  /**
   * 백그라운드 소셜 토큰 해제 (비블로킹)
   */
  private async revokeSocialTokensInBackground(
    userId: string,
    loginType: LoginType,
    appleRefreshToken?: string | null,
    googleRefreshToken?: string | null
  ) {
    const revokeTasks: Promise<any>[] = [];

    if (loginType === 'apple' && appleRefreshToken) {
      revokeTasks.push(
        this.socialAuthService.revokeAppleConnection(userId, appleRefreshToken)
          .catch(error => this.logger.warn(`Apple token revocation failed: ${error.message}`))
      );
    }

    if (loginType === 'google' && googleRefreshToken) {
      revokeTasks.push(
        this.socialAuthService.revokeGoogleConnection(userId, googleRefreshToken)
          .catch(error => this.logger.warn(`Google token revocation failed: ${error.message}`))
      );
    }

    if (revokeTasks.length > 0) {
      return Promise.all(revokeTasks);
    }
  }

  /**
   * 최적화된 로컬 데이터 삭제 (단일 트랜잭션)
   */
  private async performFastLocalDeletion(userId: string) {
    const pool = await getPool();
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
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(`Local deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Supabase 사용자 삭제 (비동기)
   */
  private async deleteSupabaseUserAsync(userId: string): Promise<boolean> {
    try {
      await this.supabaseService.deleteUser(userId);
      return true;
    } catch (error) {
      this.logger.warn(`Supabase user deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * 사용자 관련 모든 캐시 무효화
   */
  private async invalidateUserCaches(userId: string): Promise<void> {
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
    } catch (error) {
      this.logger.warn(`Cache invalidation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}