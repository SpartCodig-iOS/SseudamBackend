import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../../cache-shared/services/cacheService';
import { JwtBlacklistRepository, CreateBlacklistEntryDto, BlacklistStats } from '../repositories/jwt-blacklist.repository';
import { JwtBlacklist, BlacklistReason } from '../entities/jwt-blacklist.entity';

@Injectable()
export class TypeOrmJwtBlacklistService {
  private readonly logger = new Logger(TypeOrmJwtBlacklistService.name);
  private readonly CACHE_PREFIX = 'jwt_blacklist_cache:';
  private readonly CACHE_TTL = 300; // 5분 캐시

  constructor(
    private readonly blacklistRepository: JwtBlacklistRepository,
    private readonly cacheService: CacheService
  ) {}

  /**
   * 토큰을 블랙리스트에 추가
   */
  async addToBlacklist(
    tokenId: string,
    userId: string,
    expiresAt: Date,
    reason: BlacklistReason = 'logout',
    userAgent?: string,
    ipAddress?: string
  ): Promise<JwtBlacklist> {
    const ttlSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);

    if (ttlSeconds <= 0) {
      this.logger.debug(`Token ${tokenId} already expired, skipping blacklist`);
      throw new Error('Cannot blacklist an expired token');
    }

    try {
      const blacklistEntry = await this.blacklistRepository.addToBlacklist({
        tokenId,
        userId,
        expiresAt,
        reason,
        userAgent,
        ipAddress,
      });

      // 캐시에도 추가하여 빠른 조회 지원
      await this.setCacheBlacklist(tokenId, true);

      this.logger.log(
        `Token blacklisted: ${tokenId} (user: ${userId}, reason: ${reason})`
      );

      return blacklistEntry;
    } catch (error) {
      this.logger.error(`Failed to blacklist token ${tokenId}:`, error);
      throw error;
    }
  }

  /**
   * 토큰이 블랙리스트에 있는지 확인 (캐시 + DB)
   */
  async isBlacklisted(tokenId: string): Promise<boolean> {
    try {
      // 1. 캐시 먼저 확인
      const cacheKey = `${this.CACHE_PREFIX}${tokenId}`;
      const cachedResult = await this.cacheService.get<boolean>(cacheKey);

      if (cachedResult !== null) {
        return cachedResult;
      }

      // 2. DB에서 확인
      const isBlacklisted = await this.blacklistRepository.isBlacklisted(tokenId);

      // 3. 캐시에 저장
      await this.setCacheBlacklist(tokenId, isBlacklisted);

      return isBlacklisted;
    } catch (error) {
      this.logger.error(`Failed to check blacklist for token ${tokenId}:`, error);
      // 에러 시 안전을 위해 블랙리스트로 간주
      return true;
    }
  }

  /**
   * 토큰 블랙리스트 정보 조회
   */
  async getBlacklistEntry(tokenId: string): Promise<JwtBlacklist | null> {
    try {
      return await this.blacklistRepository.findByTokenId(tokenId);
    } catch (error) {
      this.logger.error(`Failed to get blacklist entry for token ${tokenId}:`, error);
      return null;
    }
  }

  /**
   * 사용자의 모든 토큰을 블랙리스트에 추가
   */
  async blacklistAllUserTokens(
    userId: string,
    reason: BlacklistReason = 'security',
    userAgent?: string,
    ipAddress?: string
  ): Promise<number> {
    try {
      const blacklistedCount = await this.blacklistRepository.blacklistAllUserTokens(
        userId,
        reason,
        userAgent,
        ipAddress
      );

      // 사용자 관련 캐시 무효화
      await this.invalidateUserTokensCache(userId);

      this.logger.warn(
        `Blacklisted ${blacklistedCount} tokens for user ${userId} (reason: ${reason})`
      );

      return blacklistedCount;
    } catch (error) {
      this.logger.error(`Failed to blacklist all tokens for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * 사용자의 블랙리스트된 토큰 목록 조회
   */
  async getUserTokens(userId: string): Promise<JwtBlacklist[]> {
    try {
      return await this.blacklistRepository.findUserTokens(userId);
    } catch (error) {
      this.logger.error(`Failed to get user tokens for ${userId}:`, error);
      return [];
    }
  }

  /**
   * 블랙리스트 통계 조회
   */
  async getBlacklistStats(): Promise<BlacklistStats> {
    try {
      return await this.blacklistRepository.getBlacklistStats();
    } catch (error) {
      this.logger.error('Failed to get blacklist stats:', error);
      return {
        totalBlacklisted: 0,
        recentBlacklisted: 0,
        topReasons: {},
      };
    }
  }

  /**
   * 만료된 블랙리스트 엔트리 정리
   */
  async cleanupExpiredEntries(): Promise<number> {
    try {
      const cleanedCount = await this.blacklistRepository.cleanupExpiredEntries();

      if (cleanedCount > 0) {
        this.logger.log(`Cleaned up ${cleanedCount} expired blacklist entries`);
      }

      return cleanedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup expired blacklist entries:', error);
      return 0;
    }
  }

  /**
   * 배치로 여러 토큰 블랙리스트 처리
   */
  async blacklistTokensBatch(
    tokenData: Array<{
      tokenId: string;
      userId: string;
      expiresAt: Date;
      reason?: BlacklistReason;
      userAgent?: string;
      ipAddress?: string;
    }>
  ): Promise<JwtBlacklist[]> {
    try {
      const validTokenData = tokenData.filter(data =>
        data.expiresAt.getTime() > Date.now()
      );

      if (validTokenData.length === 0) {
        this.logger.debug('No valid tokens to blacklist in batch');
        return [];
      }

      const result = await this.blacklistRepository.blacklistTokensBatch(validTokenData);

      // 캐시에 모든 토큰 업데이트
      await Promise.all(
        validTokenData.map(data => this.setCacheBlacklist(data.tokenId, true))
      );

      this.logger.log(`Batch blacklisted ${result.length} tokens`);
      return result;

    } catch (error) {
      this.logger.error('Failed to blacklist tokens in batch:', error);
      throw error;
    }
  }

  /**
   * 블랙리스트에서 토큰 제거 (관리자용)
   */
  async removeFromBlacklist(tokenId: string): Promise<boolean> {
    try {
      const removed = await this.blacklistRepository.removeFromBlacklist(tokenId);

      if (removed) {
        // 캐시에서도 제거
        await this.deleteCacheBlacklist(tokenId);
        this.logger.log(`Token removed from blacklist: ${tokenId}`);
      }

      return removed;
    } catch (error) {
      this.logger.error(`Failed to remove token from blacklist ${tokenId}:`, error);
      return false;
    }
  }

  // === Private Methods ===

  /**
   * 캐시에 블랙리스트 상태 설정
   */
  private async setCacheBlacklist(tokenId: string, isBlacklisted: boolean): Promise<void> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}${tokenId}`;
      await this.cacheService.set(cacheKey, isBlacklisted, { ttl: this.CACHE_TTL });
    } catch (error) {
      this.logger.warn(`Failed to cache blacklist status for token ${tokenId}:`, error);
      // 캐시 실패는 치명적이지 않으므로 에러를 던지지 않음
    }
  }

  /**
   * 캐시에서 블랙리스트 상태 제거
   */
  private async deleteCacheBlacklist(tokenId: string): Promise<void> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}${tokenId}`;
      await this.cacheService.del(cacheKey);
    } catch (error) {
      this.logger.warn(`Failed to delete cache for token ${tokenId}:`, error);
    }
  }

  /**
   * 사용자 관련 캐시 무효화
   */
  private async invalidateUserTokensCache(userId: string): Promise<void> {
    try {
      // 사용자의 토큰들을 조회해서 캐시에서 제거
      const userTokens = await this.blacklistRepository.findUserTokens(userId);

      await Promise.all(
        userTokens.map(token => this.deleteCacheBlacklist(token.tokenId))
      );
    } catch (error) {
      this.logger.warn(`Failed to invalidate cache for user ${userId}:`, error);
    }
  }
}

// 호환성을 위한 별칭 export
export { TypeOrmJwtBlacklistService as JwtBlacklistService };