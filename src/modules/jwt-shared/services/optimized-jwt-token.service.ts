import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { CacheService } from '../../cache-shared/services/cacheService';
import { env } from '../../../config/env';

export interface JwtTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface JwtPayload {
  sub: string; // user ID
  jti: string; // JWT ID
  email?: string;
  role?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

export interface RefreshTokenData {
  userId: string;
  tokenFamily: string;
  deviceId?: string;
  userAgent?: string;
  ipAddress?: string;
  createdAt: number;
}

@Injectable()
export class OptimizedJwtTokenService {
  private readonly logger = new Logger(OptimizedJwtTokenService.name);
  private readonly REFRESH_TOKEN_PREFIX = 'refresh_token:';
  private readonly TOKEN_FAMILY_PREFIX = 'token_family:';

  constructor(
    private readonly jwtService: JwtService,
    private readonly cacheService: CacheService
  ) {
    this.initializeBackgroundCleanup();
  }

  /**
   * 토큰 쌍 생성 (Access Token + Refresh Token)
   */
  async generateTokenPair(
    userId: string,
    email?: string,
    role?: string,
    deviceId?: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<JwtTokenPair> {
    try {
      const tokenId = randomUUID();
      const tokenFamily = randomUUID();

      // Access Token 생성
      const accessTokenPayload: JwtPayload = {
        sub: userId,
        jti: tokenId,
        email,
        role,
      };

      const accessToken = this.jwtService.sign(accessTokenPayload);

      // Refresh Token 생성 및 저장
      const refreshToken = await this.createRefreshToken(
        userId,
        tokenFamily,
        deviceId,
        userAgent,
        ipAddress
      );

      this.logger.debug(`Token pair generated for user: ${userId}`);

      return {
        accessToken,
        refreshToken,
        expiresIn: env.accessTokenTTL,
        tokenType: 'Bearer',
      };
    } catch (error) {
      this.logger.error(`Failed to generate token pair for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Refresh Token으로 새 토큰 쌍 생성
   */
  async refreshTokenPair(
    refreshToken: string,
    deviceId?: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<JwtTokenPair> {
    try {
      // Refresh Token 검증 및 데이터 조회
      const tokenData = await this.validateRefreshToken(refreshToken);

      if (!tokenData) {
        throw new Error('Invalid or expired refresh token');
      }

      // 기존 Refresh Token 무효화
      await this.revokeRefreshToken(refreshToken);

      // 새 토큰 쌍 생성
      const newTokenPair = await this.generateTokenPair(
        tokenData.userId,
        undefined, // email은 별도로 조회 필요
        undefined, // role은 별도로 조회 필요
        deviceId || tokenData.deviceId,
        userAgent || tokenData.userAgent,
        ipAddress || tokenData.ipAddress
      );

      this.logger.debug(`Token pair refreshed for user: ${tokenData.userId}`);

      return newTokenPair;
    } catch (error) {
      this.logger.error('Failed to refresh token pair:', error);
      throw error;
    }
  }

  /**
   * Refresh Token 생성
   */
  private async createRefreshToken(
    userId: string,
    tokenFamily: string,
    deviceId?: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<string> {
    const refreshToken = randomUUID();
    const tokenData: RefreshTokenData = {
      userId,
      tokenFamily,
      deviceId,
      userAgent,
      ipAddress,
      createdAt: Date.now(),
    };

    // Refresh Token 저장 (30일 TTL)
    const ttl = env.refreshTokenTTL || 30 * 24 * 60 * 60; // 30일
    await this.cacheService.set(
      `${this.REFRESH_TOKEN_PREFIX}${refreshToken}`,
      tokenData,
      { ttl }
    );

    // Token Family에 추가
    await this.addToTokenFamily(tokenFamily, refreshToken);

    return refreshToken;
  }

  /**
   * Refresh Token 검증
   */
  async validateRefreshToken(refreshToken: string): Promise<RefreshTokenData | null> {
    try {
      const tokenData = await this.cacheService.get<RefreshTokenData>(
        `${this.REFRESH_TOKEN_PREFIX}${refreshToken}`
      );

      if (!tokenData) {
        return null;
      }

      // 토큰 만료 검사 (추가 보안)
      const maxAge = (env.refreshTokenTTL || 30 * 24 * 60 * 60) * 1000;
      if (Date.now() - tokenData.createdAt > maxAge) {
        await this.revokeRefreshToken(refreshToken);
        return null;
      }

      return tokenData;
    } catch (error) {
      this.logger.error(`Failed to validate refresh token:`, error);
      return null;
    }
  }

  /**
   * Refresh Token 무효화
   */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    try {
      const tokenData = await this.cacheService.get<RefreshTokenData>(
        `${this.REFRESH_TOKEN_PREFIX}${refreshToken}`
      );

      if (tokenData) {
        // Token Family에서 제거
        await this.removeFromTokenFamily(tokenData.tokenFamily, refreshToken);
      }

      // Refresh Token 삭제
      await this.cacheService.del(`${this.REFRESH_TOKEN_PREFIX}${refreshToken}`);

      this.logger.debug(`Refresh token revoked: ${refreshToken}`);
    } catch (error) {
      this.logger.error(`Failed to revoke refresh token:`, error);
      throw error;
    }
  }

  /**
   * 사용자의 모든 Refresh Token 무효화
   */
  async revokeAllUserTokens(userId: string): Promise<number> {
    try {
      let revokedCount = 0;

      // 패턴으로 사용자의 모든 토큰 검색
      const pattern = `${this.REFRESH_TOKEN_PREFIX}*`;
      const keys = await this.cacheService.scanKeys(pattern);

      for (const key of keys) {
        const tokenData = await this.cacheService.get<RefreshTokenData>(key);
        if (tokenData && tokenData.userId === userId) {
          const refreshToken = key.replace(this.REFRESH_TOKEN_PREFIX, '');
          await this.revokeRefreshToken(refreshToken);
          revokedCount++;
        }
      }

      this.logger.log(`Revoked ${revokedCount} refresh tokens for user: ${userId}`);
      return revokedCount;
    } catch (error) {
      this.logger.error(`Failed to revoke all tokens for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Token Family에 토큰 추가
   */
  private async addToTokenFamily(tokenFamily: string, refreshToken: string): Promise<void> {
    try {
      const familyKey = `${this.TOKEN_FAMILY_PREFIX}${tokenFamily}`;
      const family = (await this.cacheService.get<string[]>(familyKey)) || [];

      family.push(refreshToken);

      // Token Family 저장 (Refresh Token과 같은 TTL)
      const ttl = env.refreshTokenTTL || 30 * 24 * 60 * 60;
      await this.cacheService.set(familyKey, family, { ttl });
    } catch (error) {
      this.logger.warn(`Failed to add token to family:`, error);
    }
  }

  /**
   * Token Family에서 토큰 제거
   */
  private async removeFromTokenFamily(tokenFamily: string, refreshToken: string): Promise<void> {
    try {
      const familyKey = `${this.TOKEN_FAMILY_PREFIX}${tokenFamily}`;
      const family = (await this.cacheService.get<string[]>(familyKey)) || [];

      const updatedFamily = family.filter((token: any) => token !== refreshToken);

      if (updatedFamily.length === 0) {
        await this.cacheService.del(familyKey);
      } else {
        const ttl = env.refreshTokenTTL || 30 * 24 * 60 * 60;
        await this.cacheService.set(familyKey, updatedFamily, { ttl });
      }
    } catch (error) {
      this.logger.warn(`Failed to remove token from family:`, error);
    }
  }

  /**
   * Token Family 전체 무효화 (보안 침해 감지 시)
   */
  async revokeTokenFamily(tokenFamily: string): Promise<number> {
    try {
      const familyKey = `${this.TOKEN_FAMILY_PREFIX}${tokenFamily}`;
      const family = (await this.cacheService.get<string[]>(familyKey)) || [];

      let revokedCount = 0;

      // Family의 모든 토큰 무효화
      for (const refreshToken of family) {
        await this.revokeRefreshToken(refreshToken);
        revokedCount++;
      }

      // Token Family 삭제
      await this.cacheService.del(familyKey);

      this.logger.warn(`Token family revoked: ${tokenFamily} (${revokedCount} tokens)`);
      return revokedCount;
    } catch (error) {
      this.logger.error(`Failed to revoke token family ${tokenFamily}:`, error);
      throw error;
    }
  }

  /**
   * JWT 토큰 디코딩 (검증 없이)
   */
  decodeToken(token: string): JwtPayload | null {
    try {
      return this.jwtService.decode(token) as JwtPayload;
    } catch (error) {
      this.logger.debug('Failed to decode JWT token:', error);
      return null;
    }
  }

  /**
   * JWT 토큰 검증
   */
  async verifyToken(token: string): Promise<JwtPayload | null> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      return payload;
    } catch (error) {
      this.logger.debug('JWT token verification failed:', error);
      return null;
    }
  }

  /**
   * 토큰 통계 조회
   */
  async getTokenStats(): Promise<{
    totalRefreshTokens: number;
    activeTokenFamilies: number;
  }> {
    try {
      const [refreshTokens, tokenFamilies] = await Promise.all([
        this.cacheService.scanKeys(`${this.REFRESH_TOKEN_PREFIX}*`),
        this.cacheService.scanKeys(`${this.TOKEN_FAMILY_PREFIX}*`),
      ]);

      return {
        totalRefreshTokens: refreshTokens.length,
        activeTokenFamilies: tokenFamilies.length,
      };
    } catch (error) {
      this.logger.error('Failed to get token stats:', error);
      return {
        totalRefreshTokens: 0,
        activeTokenFamilies: 0,
      };
    }
  }

  /**
   * 백그라운드 정리 작업 초기화
   */
  private initializeBackgroundCleanup(): void {
    // Railway Sleep 모드에서는 백그라운드 작업 비활성화
    if (env.nodeEnv !== 'production' || env.railwaySleepMode === 'true') {
      this.logger.log('JWT background cache cleanup disabled for Railway Sleep mode support');
      return;
    }

    // 주기적 정리 (4시간마다)
    const cleanupInterval = 4 * 60 * 60 * 1000;
    setInterval(async () => {
      await this.cleanupExpiredTokens();
    }, cleanupInterval);

    this.logger.log('JWT background cleanup initialized');
  }

  /**
   * 만료된 토큰 정리
   */
  async cleanupExpiredTokens(): Promise<number> {
    try {
      let cleanedCount = 0;
      const pattern = `${this.REFRESH_TOKEN_PREFIX}*`;
      const keys = await this.cacheService.scanKeys(pattern);

      for (const key of keys) {
        const tokenData = await this.cacheService.get<RefreshTokenData>(key);
        if (!tokenData) {
          await this.cacheService.del(key);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        this.logger.log(`Cleaned up ${cleanedCount} expired refresh tokens`);
      }

      return cleanedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup expired tokens:', error);
      return 0;
    }
  }
}