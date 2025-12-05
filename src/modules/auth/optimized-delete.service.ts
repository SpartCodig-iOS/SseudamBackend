import { Injectable, Logger } from '@nestjs/common';
import { UserRecord } from '../../types/user';
import { LoginType } from '../../types/auth';
import { getPool } from '../../db/pool';
import { SupabaseService } from '../../services/supabaseService';
import { OAuthTokenService } from '../../services/oauth-token.service';
import { SocialAuthService } from '../oauth/social-auth.service';
import { CacheService } from '../../services/cacheService';

@Injectable()
export class OptimizedDeleteService {
  private readonly logger = new Logger(OptimizedDeleteService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly oauthTokenService: OAuthTokenService,
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

      const avatarUrl = profileData?.avatar_url || user.avatar_url || null;
      const loginType = profileData?.login_type || loginTypeHint || 'email';
      const [appleRefreshToken, googleRefreshToken, kakaoRefreshToken] = await Promise.all([
        this.oauthTokenService.getToken(user.id, 'apple'),
        this.oauthTokenService.getToken(user.id, 'google'),
        this.oauthTokenService.getToken(user.id, 'kakao'),
      ]);

      // 2. 소셜 토큰 해제를 백그라운드에서 처리 (블로킹하지 않음)
      const socialRevokePromise = this.revokeSocialTokensInBackground(
        user.id,
        loginType,
        appleRefreshToken,
        googleRefreshToken,
        kakaoRefreshToken
      );

      // 3. 로컬 데이터 삭제를 트랜잭션으로 빠르게 처리
      const localDeletePromise = this.performFastLocalDeletion(user.id);

      // 4. Supabase 사용자 삭제 (auth only)
      const supabaseDeletePromise = this.deleteSupabaseUserAsync(user.id);

      // 5. 프로필 이미지 삭제 (스토리지)
      const profileImageDeletePromise = this.supabaseService.deleteProfileImage(avatarUrl)
        .catch(error => this.logger.warn(`Profile image deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`));

      // 6. 캐시 무효화: 로컬 삭제 완료 후 해당 여행/사용자 캐시 제거
      const cacheCleanupPromise = localDeletePromise.then(travelIds =>
        this.invalidateUserCaches(user.id, travelIds)
      );

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
        `SELECT login_type, apple_refresh_token, google_refresh_token, avatar_url
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
    googleRefreshToken?: string | null,
    kakaoRefreshToken?: string | null,
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

    if (loginType === 'kakao' && kakaoRefreshToken) {
      revokeTasks.push(
        this.socialAuthService.revokeKakaoConnection(userId, kakaoRefreshToken)
          .catch(error => this.logger.warn(`Kakao token revocation failed: ${error.message}`))
      );
    }

    if (revokeTasks.length > 0) {
      return Promise.all(revokeTasks);
    }
  }

  /**
   * 최적화된 로컬 데이터 삭제 (단일 트랜잭션)
   */
  private async performFastLocalDeletion(userId: string): Promise<string[]> {
    const pool = await getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 소유한 여행 ID를 먼저 수집 (캐시 무효화용)
      const targetTravelsResult = await client.query<{ id: string }>(
        'SELECT id::text FROM travels WHERE owner_id = $1',
        [userId],
      );
      const travelIdArray = targetTravelsResult.rows.map((r) => r.id);

      // 1) 사용자가 소유한 여행과 그 하위 데이터 제거
      if (travelIdArray.length > 0) {
        await client.query(
          `DELETE FROM travel_expense_participants
             WHERE expense_id IN (SELECT id FROM travel_expenses WHERE travel_id = ANY($1::uuid[]))`,
          [travelIdArray],
        );
        await client.query(
          `DELETE FROM travel_expenses WHERE travel_id = ANY($1::uuid[])`,
          [travelIdArray],
        );
        await client.query(
          `DELETE FROM travel_settlements WHERE travel_id = ANY($1::uuid[])`,
          [travelIdArray],
        );
        await client.query(
          `DELETE FROM travel_invites WHERE travel_id = ANY($1::uuid[])`,
          [travelIdArray],
        );
        await client.query(
          `DELETE FROM travel_members WHERE travel_id = ANY($1::uuid[])`,
          [travelIdArray],
        );
        await client.query(
          `DELETE FROM travels WHERE id = ANY($1::uuid[])`,
          [travelIdArray],
        );
      }

      // 2) 사용자 자신이 만든/참여한 잔여 데이터 제거
      await client.query(`DELETE FROM travel_expense_participants WHERE member_id = $1`, [userId]);
      await client.query(`DELETE FROM travel_expenses WHERE payer_id = $1`, [userId]);
      await client.query(`DELETE FROM travel_settlements WHERE from_member = $1 OR to_member = $1`, [userId]);
      await client.query(`DELETE FROM travel_invites WHERE created_by = $1`, [userId]);
      await client.query(`DELETE FROM travel_members WHERE user_id = $1`, [userId]);
      await client.query(`DELETE FROM user_sessions WHERE user_id = $1`, [userId]);

      // 3) 프로필 삭제
      await client.query(`DELETE FROM profiles WHERE id = $1`, [userId]);

      await client.query('COMMIT');
      this.logger.debug(`Local data deletion completed for user ${userId}`);

      return travelIdArray;
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
  private async invalidateUserCaches(userId: string, travelIds: string[] = []): Promise<void> {
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
    } catch (error) {
      this.logger.warn(`Cache invalidation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
