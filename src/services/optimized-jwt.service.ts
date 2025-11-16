import { Injectable, Logger } from '@nestjs/common';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { createHash } from 'crypto';
import { env } from '../config/env';
import { LoginType } from '../types/auth';
import { UserRecord } from '../types/user';
import { CacheService } from './cacheService';

export interface TokenPair {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

interface RefreshPayload extends JwtPayload {
  sub: string;
  typ: string;
  sessionId: string;
}

export interface AccessPayload extends JwtPayload {
  sub: string;
  email: string;
  name?: string | null;
  loginType?: LoginType;
  lastLoginAt?: string;
  sessionId: string;
}

interface CachedTokenData {
  payload: AccessPayload | RefreshPayload;
  isValid: boolean;
  cached_at: number;
}

const secondsToMs = (value: number): number => value * 1000;

@Injectable()
export class OptimizedJwtTokenService {
  private readonly logger = new Logger(OptimizedJwtTokenService.name);
  private readonly TOKEN_CACHE_PREFIX = 'jwt_token';
  private readonly TOKEN_CACHE_TTL = 5 * 60; // 5분
  private readonly INVALID_TOKEN_CACHE_TTL = 60; // 1분 (잘못된 토큰은 짧게 캐시)

  // 메모리 기반 토큰 캐시 (Redis 장애 시 fallback)
  private tokenCache = new Map<string, CachedTokenData>();
  private readonly MAX_MEMORY_CACHE_SIZE = 1000;

  constructor(private readonly cacheService: CacheService) {
    // 메모리 캐시 정리 (운영환경에서는 1시간마다, 개발환경에서는 30분마다)
    const cleanupInterval = process.env.NODE_ENV === 'production' ? 60 * 60 * 1000 : 30 * 60 * 1000;
    setInterval(() => {
      this.cleanupMemoryCache();
    }, cleanupInterval);
  }

  private createAccessPayload(user: UserRecord, sessionId: string, loginType?: LoginType): AccessPayload {
    return {
      sub: user.id,
      email: user.email,
      name: user.name ?? undefined,
      loginType,
      lastLoginAt: new Date().toISOString(),
      sessionId,
    };
  }

  private createRefreshPayload(user: UserRecord, sessionId: string): RefreshPayload {
    return {
      sub: user.id,
      typ: 'refresh',
      sessionId,
    };
  }

  private getTokenCacheKey(token: string): string {
    // 토큰의 해시를 키로 사용 (보안 + 메모리 효율)
    return createHash('sha256').update(token).digest('hex').substring(0, 16);
  }

  private async getCachedToken(token: string): Promise<CachedTokenData | null> {
    const cacheKey = this.getTokenCacheKey(token);

    try {
      // 1. Redis 캐시 확인
      const cached = await this.cacheService.get<CachedTokenData>(cacheKey, {
        prefix: this.TOKEN_CACHE_PREFIX,
      });

      if (cached) {
        return cached;
      }

      // 2. 메모리 캐시 확인 (fallback)
      const memoryCached = this.tokenCache.get(cacheKey);
      if (memoryCached && Date.now() - memoryCached.cached_at < this.TOKEN_CACHE_TTL * 1000) {
        return memoryCached;
      }

      return null;
    } catch (error) {
      this.logger.warn(`Token cache read failed: ${error instanceof Error ? error.message : 'Unknown error'}`);

      // 메모리 캐시 fallback
      const memoryCached = this.tokenCache.get(cacheKey);
      if (memoryCached && Date.now() - memoryCached.cached_at < this.TOKEN_CACHE_TTL * 1000) {
        return memoryCached;
      }

      return null;
    }
  }

  private async setCachedToken(token: string, data: CachedTokenData): Promise<void> {
    const cacheKey = this.getTokenCacheKey(token);
    const ttl = data.isValid ? this.TOKEN_CACHE_TTL : this.INVALID_TOKEN_CACHE_TTL;

    try {
      // Redis 캐시 저장
      await this.cacheService.set(cacheKey, data, {
        prefix: this.TOKEN_CACHE_PREFIX,
        ttl,
      });
    } catch (error) {
      this.logger.warn(`Token cache write failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // 메모리 캐시 저장 (항상)
    if (this.tokenCache.size >= this.MAX_MEMORY_CACHE_SIZE) {
      this.cleanupMemoryCache();
    }

    this.tokenCache.set(cacheKey, {
      ...data,
      cached_at: Date.now(),
    });
  }

  private cleanupMemoryCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, data] of this.tokenCache.entries()) {
      if (now - data.cached_at > this.TOKEN_CACHE_TTL * 1000) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.tokenCache.delete(key);
    }

    // 크기가 여전히 크면 오래된 순으로 정리
    if (this.tokenCache.size > this.MAX_MEMORY_CACHE_SIZE * 0.8) {
      const entries = Array.from(this.tokenCache.entries())
        .sort((a, b) => a[1].cached_at - b[1].cached_at)
        .slice(0, Math.floor(this.MAX_MEMORY_CACHE_SIZE * 0.3));

      for (const [key] of entries) {
        this.tokenCache.delete(key);
      }
    }

    if (expiredKeys.length > 0 || this.tokenCache.size > this.MAX_MEMORY_CACHE_SIZE * 0.8) {
      this.logger.debug(`Memory cache cleanup: removed ${expiredKeys.length} expired tokens, current size: ${this.tokenCache.size}`);
    }
  }

  async generateTokenPair(user: UserRecord, loginType?: LoginType): Promise<TokenPair> {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // 병렬로 토큰 생성
    const [accessToken, refreshToken] = await Promise.all([
      this.generateAccessTokenAsync(user, sessionId, loginType),
      this.generateRefreshTokenAsync(user, sessionId),
    ]);

    const accessTokenExpiresAt = new Date(Date.now() + secondsToMs(3600)); // 1시간
    const refreshTokenExpiresAt = new Date(Date.now() + secondsToMs(86400 * 7)); // 7일

    return {
      accessToken,
      accessTokenExpiresAt,
      refreshToken,
      refreshTokenExpiresAt,
    };
  }

  private async generateAccessTokenAsync(user: UserRecord, sessionId: string, loginType?: LoginType): Promise<string> {
    return new Promise((resolve, reject) => {
      const payload = this.createAccessPayload(user, sessionId, loginType);
      jwt.sign(
        payload,
        env.jwtSecret,
        {
          expiresIn: `${env.accessTokenTTL}s`,
          issuer: 'sseduam-api',
          audience: 'sseduam-app',
        },
        (err, token) => {
          if (err || !token) {
            reject(err || new Error('Token generation failed'));
          } else {
            resolve(token);
          }
        }
      );
    });
  }

  private async generateRefreshTokenAsync(user: UserRecord, sessionId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const payload = this.createRefreshPayload(user, sessionId);
      jwt.sign(
        payload,
        env.jwtSecret,
        {
          expiresIn: `${env.refreshTokenTTL}s`,
          issuer: 'sseduam-api',
          audience: 'sseduam-app',
        },
        (err, token) => {
          if (err || !token) {
            reject(err || new Error('Refresh token generation failed'));
          } else {
            resolve(token);
          }
        }
      );
    });
  }

  async verifyAccessToken(token: string): Promise<AccessPayload | null> {
    // 캐시 확인
    const cached = await this.getCachedToken(token);
    if (cached) {
      if (!cached.isValid) {
        return null;
      }
      return cached.payload as AccessPayload;
    }

    // 캐시 미스 - 토큰 검증
    try {
      const startTime = process.hrtime.bigint();

      const payload = await new Promise<AccessPayload>((resolve, reject) => {
        jwt.verify(token, env.jwtSecret, {
          issuer: 'sseduam-api',
          audience: 'sseduam-app',
        }, (err, decoded) => {
          if (err || !decoded || typeof decoded === 'string') {
            reject(err || new Error('Invalid token'));
          } else {
            const accessPayload = decoded as AccessPayload;
            if (accessPayload.typ === 'refresh') {
              reject(new Error('Refresh token provided instead of access token'));
            } else {
              resolve(accessPayload);
            }
          }
        });
      });

      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;

      // 성공한 검증 결과 캐시
      await this.setCachedToken(token, {
        payload,
        isValid: true,
        cached_at: Date.now(),
      });

      // 느린 토큰 검증 로깅
      if (durationMs > 10) {
        this.logger.warn(`Slow token verification: ${durationMs.toFixed(2)}ms`);
      }

      return payload;
    } catch (error) {
      // 실패한 검증 결과도 짧게 캐시 (동일한 잘못된 토큰의 반복 검증 방지)
      await this.setCachedToken(token, {
        payload: {} as any,
        isValid: false,
        cached_at: Date.now(),
      });

      this.logger.debug(`Token verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  async verifyRefreshToken(token: string): Promise<RefreshPayload | null> {
    // 캐시 확인
    const cached = await this.getCachedToken(token);
    if (cached) {
      if (!cached.isValid) {
        return null;
      }
      const payload = cached.payload as RefreshPayload;
      if (payload.typ === 'refresh') {
        return payload;
      }
    }

    // 캐시 미스 - 토큰 검증
    try {
      const payload = await new Promise<RefreshPayload>((resolve, reject) => {
        jwt.verify(token, env.jwtSecret, {
          issuer: 'sseduam-api',
          audience: 'sseduam-app',
        }, (err, decoded) => {
          if (err || !decoded || typeof decoded === 'string') {
            reject(err || new Error('Invalid token'));
          } else {
            const refreshPayload = decoded as RefreshPayload;
            if (refreshPayload.typ !== 'refresh') {
              reject(new Error('Access token provided instead of refresh token'));
            } else {
              resolve(refreshPayload);
            }
          }
        });
      });

      // 성공한 검증 결과 캐시
      await this.setCachedToken(token, {
        payload,
        isValid: true,
        cached_at: Date.now(),
      });

      return payload;
    } catch (error) {
      // 실패한 검증 결과도 짧게 캐시
      await this.setCachedToken(token, {
        payload: {} as any,
        isValid: false,
        cached_at: Date.now(),
      });

      this.logger.debug(`Refresh token verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  // 토큰 무효화 (로그아웃 시 사용)
  async invalidateToken(token: string): Promise<void> {
    const cacheKey = this.getTokenCacheKey(token);

    try {
      // Redis에서 삭제
      await this.cacheService.del(cacheKey, { prefix: this.TOKEN_CACHE_PREFIX });
    } catch (error) {
      this.logger.warn(`Token cache invalidation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // 메모리 캐시에서도 삭제
    this.tokenCache.delete(cacheKey);
  }

  // 사용자의 모든 토큰 무효화
  async invalidateUserTokens(userId: string): Promise<void> {
    // 패턴 기반 삭제는 Redis에서만 가능
    try {
      await this.cacheService.delPattern(`${this.TOKEN_CACHE_PREFIX}:*`);
      this.logger.debug(`Invalidated all cached tokens for security`);
    } catch (error) {
      this.logger.warn(`Bulk token invalidation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // 메모리 캐시 전체 클리어 (보안상 안전)
    this.tokenCache.clear();
  }

  // 캐시 통계
  getCacheStats() {
    return {
      memoryCacheSize: this.tokenCache.size,
      maxMemoryCacheSize: this.MAX_MEMORY_CACHE_SIZE,
      memoryCacheUtilization: (this.tokenCache.size / this.MAX_MEMORY_CACHE_SIZE * 100).toFixed(1) + '%',
    };
  }
}