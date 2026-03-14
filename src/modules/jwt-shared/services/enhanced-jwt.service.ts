import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import { UserRecord } from '../../../types/user.types';
import { LoginType } from '../../auth/types/auth.types';
import { JwtBlacklistService } from '../../auth/services/typeorm-jwt-blacklist.service';
import { env } from '../../../config/env';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenTTL: number;
  refreshTokenTTL: number;
  tokenId: string;
}

export interface JwtPayload {
  sub: string; // userId
  email: string;
  name: string | null;
  role: string;
  loginType: LoginType;
  sessionId: string;
  tokenId: string; // 고유 토큰 ID (blacklist용)
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

@Injectable()
export class EnhancedJwtService {
  private readonly logger = new Logger(EnhancedJwtService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly blacklistService: JwtBlacklistService,
  ) {}

  /**
   * 토큰 쌍 생성 (Access + Refresh + Blacklist 지원)
   */
  async generateTokenPair(
    user: UserRecord,
    loginType: LoginType,
    sessionId: string
  ): Promise<TokenPair> {
    const tokenId = uuidv4(); // 고유 토큰 ID 생성
    const now = Math.floor(Date.now() / 1000);

    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      loginType,
      sessionId,
      tokenId,
      iss: 'sseudam-backend',
      aud: 'sseudam-app',
    };

    // Access Token 생성
    const accessToken = this.jwtService.sign(
      { ...payload, type: 'access' },
      {
        expiresIn: `${env.accessTokenTTL}s`,
        subject: user.id,
        issuer: 'sseudam-backend',
        audience: 'sseudam-app',
      }
    );

    // Refresh Token 생성 (더 긴 만료 시간)
    const refreshToken = this.jwtService.sign(
      { ...payload, type: 'refresh' },
      {
        expiresIn: `${env.refreshTokenTTL}s`,
        subject: user.id,
        issuer: 'sseudam-backend',
        audience: 'sseudam-app',
      }
    );

    this.logger.log(`Generated token pair for user ${user.id} (session: ${sessionId}, tokenId: ${tokenId})`);

    return {
      accessToken,
      refreshToken,
      accessTokenTTL: env.accessTokenTTL,
      refreshTokenTTL: env.refreshTokenTTL,
      tokenId,
    };
  }

  /**
   * 토큰 검증 (blacklist 체크 포함)
   */
  async verifyToken(token: string, type: 'access' | 'refresh'): Promise<JwtPayload | null> {
    try {
      // 1. JWT 구조 검증
      const payload = this.jwtService.verify(token) as JwtPayload;

      // 2. 토큰 타입 검증
      if ((payload as any).type !== type) {
        this.logger.debug(`Invalid token type: expected ${type}, got ${(payload as any).type}`);
        return null;
      }

      // 3. 필수 필드 검증
      if (!payload.tokenId || !payload.sub || !payload.sessionId) {
        this.logger.debug('Missing required fields in token payload');
        return null;
      }

      // 4. 블랙리스트 검증
      const isBlacklisted = await this.blacklistService.isBlacklisted(payload.tokenId);
      if (isBlacklisted) {
        this.logger.debug(`Token ${payload.tokenId} is blacklisted`);
        return null;
      }

      return payload;
    } catch (error) {
      this.logger.debug(`Token verification failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Access Token 검증
   */
  async verifyAccessToken(token: string): Promise<JwtPayload | null> {
    return this.verifyToken(token, 'access');
  }

  /**
   * Refresh Token 검증
   */
  async verifyRefreshToken(token: string): Promise<JwtPayload | null> {
    return this.verifyToken(token, 'refresh');
  }

  /**
   * 토큰 무효화 (로그아웃)
   */
  async invalidateToken(token: string, reason: 'logout' | 'security' | 'admin' = 'logout'): Promise<boolean> {
    try {
      const payload = this.jwtService.decode(token) as JwtPayload;

      if (!payload || !payload.tokenId) {
        this.logger.debug('Cannot invalidate token: invalid payload');
        return false;
      }

      const expiresAt = new Date(payload.exp * 1000);
      await this.blacklistService.addToBlacklist(
        payload.tokenId,
        payload.sub,
        expiresAt,
        reason
      );

      this.logger.log(`Token invalidated: ${payload.tokenId} (reason: ${reason})`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to invalidate token: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * 사용자의 모든 토큰 무효화 (계정 탈퇴, 보안 사고 등)
   */
  async invalidateAllUserTokens(
    userId: string,
    reason: 'logout' | 'security' | 'admin' = 'security'
  ): Promise<number> {
    try {
      const count = await this.blacklistService.blacklistAllUserTokens(userId, reason);
      this.logger.warn(`Invalidated ${count} tokens for user ${userId} (reason: ${reason})`);
      return count;
    } catch (error) {
      this.logger.error(`Failed to invalidate all tokens for user ${userId}: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }

  /**
   * 토큰에서 사용자 정보 추출 (검증 없이)
   */
  decodeToken(token: string): JwtPayload | null {
    try {
      return this.jwtService.decode(token) as JwtPayload;
    } catch (error) {
      this.logger.debug(`Failed to decode token: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * 토큰 새로고침
   */
  async refreshTokens(refreshToken: string): Promise<TokenPair | null> {
    const payload = await this.verifyRefreshToken(refreshToken);

    if (!payload) {
      this.logger.debug('Invalid refresh token');
      return null;
    }

    // 기존 토큰들을 블랙리스트에 추가
    await this.invalidateToken(refreshToken, 'logout');

    // 새로운 토큰 쌍 생성
    const user: UserRecord = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      avatar_url: null, // 토큰에는 없는 정보
      username: payload.email, // 임시
      password_hash: '', // 토큰에는 없는 정보
      role: payload.role as any,
      created_at: new Date(),
      updated_at: new Date(),
    };

    return this.generateTokenPair(user, payload.loginType, payload.sessionId);
  }

  /**
   * 토큰 통계 조회
   */
  async getTokenStats(): Promise<{
    blacklistStats: any;
    activeTokensEstimate: number;
  }> {
    const blacklistStats = await this.blacklistService.getBlacklistStats();

    return {
      blacklistStats,
      activeTokensEstimate: Math.max(0, 1000 - blacklistStats.totalBlacklisted), // 추정치
    };
  }

  /**
   * 개발용 무한 토큰 생성 (개발 환경에서만)
   */
  generateInfiniteToken(testUser: {
    id: string;
    email: string;
    name: string | null;
    role: string;
  }): string {
    if (env.nodeEnv !== 'development') {
      throw new Error('Infinite tokens are only available in development environment');
    }

    const tokenId = uuidv4();
    const payload = {
      sub: testUser.id,
      email: testUser.email,
      name: testUser.name,
      role: testUser.role,
      loginType: 'email' as LoginType,
      sessionId: `dev-session-${tokenId}`,
      tokenId,
      iss: 'sseudam-backend',
      aud: 'sseudam-app',
      type: 'access',
    };

    // 100년 만료 (사실상 무한)
    return this.jwtService.sign(payload, {
      expiresIn: '100y',
      subject: testUser.id,
      issuer: 'sseudam-backend',
      audience: 'sseudam-app',
    });
  }
}