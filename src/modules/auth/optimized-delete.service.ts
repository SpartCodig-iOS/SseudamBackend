import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { UserRecord } from '../user/types/user.types';
import { LoginType } from './types/auth.types';
import { SupabaseService } from '../../common/services/supabase.service';
import { OAuthTokenService } from '../oauth/services/oauth-token.service';
import { SocialAuthService } from '../oauth/social-auth.service';
import { CacheService } from '../../common/services/cache.service';

@Injectable()
export class OptimizedDeleteService {
  private readonly logger = new Logger(OptimizedDeleteService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
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
   * 사용자 프로필 데이터 조회 (TypeORM으로 최적화된 쿼리)
   */
  private async fetchUserProfileData(userId: string) {
    try {
      const profileRepository = this.dataSource.getRepository('Profile');
      const profile = await profileRepository.findOne({
        where: { id: userId },
        select: ['loginType', 'avatarUrl']
      });

      if (!profile) {
        return null;
      }

      // raw SQL 결과와 같은 형태로 변환
      return {
        login_type: profile.loginType,
        avatar_url: profile.avatarUrl
      };
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
   * 최적화된 로컬 데이터 삭제 (단일 트랜잭션, TypeORM으로 변환)
   */
  private async performFastLocalDeletion(userId: string): Promise<string[]> {
    let travelIdArray: string[] = [];

    await this.dataSource.transaction(async (manager) => {
      // 사용자가 참여한 모든 여행 ID 수집 (캐시 무효화용)
      const travelMemberRepository = manager.getRepository('TravelMember');
      const targetTravels = await travelMemberRepository.find({
        where: { userId },
        select: ['travelId']
      });
      travelIdArray = targetTravels.map(tm => tm.travelId);

      // 1) 사용자 세션/토큰 정리 (존재하지 않는 테이블은 건너뜀)
      try {
        const userSessionRepository = manager.getRepository('UserSession');
        await userSessionRepository.delete({ userId });
      } catch (error) {
        // 테이블이 존재하지 않을 수 있음
        this.logger.debug('UserSession table not found, skipping');
      }

      try {
        // OAuth 토큰 테이블 존재 여부 확인 후 삭제
        const oauthTokenRepository = manager.getRepository('OAuthToken');
        const count = await oauthTokenRepository.count();
        if (count >= 0) { // 테이블이 존재함
          await oauthTokenRepository.delete({ userId });
        }
      } catch (error) {
        // 테이블이 존재하지 않을 수 있음
        this.logger.debug('OAuthToken table not found, skipping');
      }

      try {
        const deviceTokenRepository = manager.getRepository('DeviceToken');
        await deviceTokenRepository.delete({ userId });
      } catch (error) {
        // 테이블이 존재하지 않을 수 있음
        this.logger.debug('DeviceToken table not found, skipping');
      }

      try {
        const travelInviteRepository = manager.getRepository('TravelInvite');
        await travelInviteRepository.update(
          { createdBy: userId },
          { createdBy: null }
        );
      } catch (error) {
        this.logger.debug('TravelInvite update failed, skipping');
      }

      // 2) 사용자가 포함된 여행 및 하위 데이터 삭제
      if (travelIdArray.length > 0) {
        // 경비 참가자 삭제 (경비가 해당 여행들에 속하는 것들)
        const travelExpenseRepository = manager.getRepository('TravelExpense');
        const expenseIds = await travelExpenseRepository.find({
          where: { travelId: In(travelIdArray) },
          select: ['id']
        });
        const expenseIdList = expenseIds.map(e => e.id);

        if (expenseIdList.length > 0) {
          const participantRepository = manager.getRepository('TravelExpenseParticipant');
          await participantRepository.delete({
            expenseId: In(expenseIdList)
          });
        }

        // 여행 경비 삭제
        await travelExpenseRepository.delete({
          travelId: In(travelIdArray)
        });

        // 여행 정산 삭제
        const travelSettlementRepository = manager.getRepository('TravelSettlement');
        await travelSettlementRepository.delete({
          travelId: In(travelIdArray)
        });

        // 여행 초대 삭제
        const travelInviteRepository = manager.getRepository('TravelInvite');
        await travelInviteRepository.delete({
          travelId: In(travelIdArray)
        });

        // 여행 멤버 삭제
        await travelMemberRepository.delete({
          travelId: In(travelIdArray)
        });

        // 여행 삭제
        const travelRepository = manager.getRepository('Travel');
        await travelRepository.delete({
          id: In(travelIdArray)
        });
      }

      // 3) 잔여 사용자 데이터 삭제
      const participantRepository = manager.getRepository('TravelExpenseParticipant');
      await participantRepository.delete({ memberId: userId });

      const expenseRepository = manager.getRepository('TravelExpense');
      await expenseRepository
        .createQueryBuilder()
        .delete()
        .from('TravelExpense')
        .where('payerId = :userId OR authorId = :userId', { userId })
        .execute();

      const settlementRepository = manager.getRepository('TravelSettlement');
      await settlementRepository
        .createQueryBuilder()
        .delete()
        .from('TravelSettlement')
        .where('fromMember = :userId OR toMember = :userId', { userId })
        .execute();

      await travelMemberRepository.delete({ userId });

      const profileRepository = manager.getRepository('Profile');
      await profileRepository.delete({ id: userId });
    });

    this.logger.debug(`Local data anonymization completed for user ${userId}`);
    return travelIdArray;
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
