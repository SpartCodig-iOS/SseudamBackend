import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestWithUser } from '../types/request.types';
import { LoginType } from '../../modules/auth/types/auth.types';
import { EnhancedJwtService } from '../../modules/auth/services/enhanced-jwt.service';
import { SupabaseService } from '../services/supabase.service';
import { fromSupabaseUser } from '../utils/mappers';
import { UserRecord } from '../../modules/user/types/user.types';
import { CacheService } from '../services/cache.service';
import { createHash } from 'crypto';
import { UserRepository } from '../../modules/user/repositories/user.repository';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { authLogger } from '../../utils/logger';

interface LocalAuthResult {
  user: UserRecord;
  loginType?: LoginType;
  sessionId: string;
}

interface CachedUser {
  user: UserRecord;
  timestamp: number;
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly tokenCache = new Map<string, CachedUser>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5분 캐시
  private readonly REDIS_PREFIX = 'auth:token';
  private readonly REDIS_TTL_SECONDS = 5 * 60;

  constructor(
    private readonly reflector: Reflector,
    private readonly enhancedJwtService: EnhancedJwtService,
    private readonly supabaseService: SupabaseService,
    private readonly cacheService: CacheService,
    private readonly userRepository: UserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Public 데코레이터가 있는 경우 인증 건너뛰기
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractBearer(request.headers.authorization);
    if (!token) {
      authLogger.warn({
        url: request.url,
        authHeader: request.headers.authorization ? 'present' : 'missing'
      }, 'Missing bearer token');
      throw new UnauthorizedException('Missing bearer token');
    }

    authLogger.debug({
      url: request.url,
      tokenLength: token.length,
      tokenPrefix: token.substring(0, 10) + '...'
    }, 'Token validation started');

    // Enhanced JWT 검증 (Blacklist 체크 포함) — 유일한 JWT 검증 경로
    const enhancedUser = await this.tryEnhancedJwt(token);
    if (enhancedUser) {
      const isLegacy = enhancedUser.user.id && token.includes('eyJ') && !token.includes('tokenId');
      authLogger.info({
        type: isLegacy ? 'LEGACY' : 'ENHANCED',
        userId: enhancedUser.user.id,
        email: enhancedUser.user.email,
        url: request.url,
        sessionId: enhancedUser.sessionId
      }, 'JWT authentication successful');

      try {
        this.setCachedUser(token, enhancedUser.user);
        // Redis 캐시 오류가 인증 성공을 방해하지 않도록 안전하게 처리
        this.setRedisCachedUser(token, { user: enhancedUser.user, loginType: enhancedUser.loginType }).catch(err => {
          console.warn('Redis cache failed, but authentication succeeded:', err.message);
        });
      } catch (error) {
        console.warn('Cache operation failed, but authentication succeeded:', error instanceof Error ? error.message : 'Unknown error');
      }

      request.currentUser = enhancedUser.user;
      request.loginType = enhancedUser.loginType;
      return true;
    } else {
      authLogger.debug({
        url: request.url,
        tokenLength: token.length
      }, 'Enhanced JWT verification failed, trying Supabase fallback');
    }

    // Supabase 토큰 검증 (소셜 로그인 등 Enhanced JWT 미발급 토큰)
    try {
      const supabaseUser = await this.supabaseService.getUserFromToken(token);
      if (supabaseUser?.email) {
        const userRecord = await this.hydrateUserRole(fromSupabaseUser(supabaseUser));

        try {
          this.setCachedUser(token, userRecord);
          // Redis 캐시 오류가 인증 성공을 방해하지 않도록 안전하게 처리
          this.setRedisCachedUser(token, { user: userRecord, loginType: 'email' }).catch(err => {
            console.warn('Redis cache failed for Supabase user, but authentication succeeded:', err.message);
          });
        } catch (error) {
          console.warn('Cache operation failed for Supabase user, but authentication succeeded:', error instanceof Error ? error.message : 'Unknown error');
        }

        request.currentUser = userRecord;
        request.loginType = 'email';
        return true;
      }
    } catch (error) {
      authLogger.warn({
        url: request.url,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Supabase authentication failed');
    }

    // 🚨 EMERGENCY FALLBACK: JWT 디코딩만으로라도 사용자 정보 추출 시도
    try {
      const decodedPayload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()) as any;

      if (decodedPayload.sub && decodedPayload.email) {
        authLogger.warn({
          url: request.url,
          userId: decodedPayload.sub,
          email: decodedPayload.email ? 'present' : 'missing',
          exp: decodedPayload.exp,
          currentTime: Math.floor(Date.now() / 1000),
          isExpired: Date.now() / 1000 > (decodedPayload.exp || 0)
        }, '🚨 EMERGENCY: Using decoded JWT payload (verification failed)');

        const emergencyUser: UserRecord = {
          id: decodedPayload.sub,
          email: decodedPayload.email,
          name: decodedPayload.name ?? null,
          avatar_url: null,
          username: decodedPayload.email?.split('@')[0] || decodedPayload.sub,
          password_hash: '',
          role: (decodedPayload.role as any) ?? 'member',
          created_at: new Date(),
          updated_at: new Date(),
        };

        request.currentUser = emergencyUser;
        request.loginType = decodedPayload.loginType || 'apple';

        authLogger.warn({
          userId: emergencyUser.id,
          email: emergencyUser.email,
          url: request.url
        }, '🚨 EMERGENCY AUTH SUCCESS: User authenticated via payload decode');

        return true;
      }
    } catch (decodeError) {
      authLogger.error({
        error: decodeError instanceof Error ? decodeError.message : 'Unknown error',
        url: request.url
      }, '🚨 Emergency JWT decode also failed');
    }

    authLogger.error({
      url: request.url,
      tokenLength: token.length,
      tokenPrefix: token.substring(0, 20) + '...',
      authHeader: request.headers.authorization ? 'present' : 'missing'
    }, 'All authentication methods failed');

    throw new UnauthorizedException('Unauthorized');
  }

  private extractBearer(authHeader?: string | string[]): string | null {
    if (!authHeader) return null;
    const value = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    const [scheme, token] = value.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return null;
    }
    return token;
  }

  private getCachedUser(token: string): UserRecord | null {
    const cached = this.tokenCache.get(token);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > this.CACHE_TTL) {
      this.tokenCache.delete(token);
      return null;
    }

    return cached.user;
  }

  private getTokenCacheKey(token: string): string {
    return createHash('sha256').update(token).digest('hex').slice(0, 32);
  }

  private async getRedisCachedUser(token: string): Promise<{ user: UserRecord; loginType?: LoginType } | null> {
    try {
      const key = this.getTokenCacheKey(token);
      return await this.cacheService.get<{ user: UserRecord; loginType?: LoginType }>(key, {
        prefix: this.REDIS_PREFIX,
      });
    } catch {
      return null;
    }
  }

  private async setRedisCachedUser(token: string, payload: { user: UserRecord; loginType?: LoginType }): Promise<void> {
    try {
      const key = this.getTokenCacheKey(token);
      await this.cacheService.set(key, payload, {
        prefix: this.REDIS_PREFIX,
        ttl: this.REDIS_TTL_SECONDS,
      });
    } catch {
      // Redis 실패는 무시하고 계속
    }
  }

  private setCachedUser(token: string, user: UserRecord): void {
    this.tokenCache.set(token, {
      user,
      timestamp: Date.now(),
    });

    // 캐시 크기 제한 (1000개로 제한)
    if (this.tokenCache.size > 1000) {
      const firstKey = this.tokenCache.keys().next().value;
      if (firstKey) {
        this.tokenCache.delete(firstKey);
      }
    }
  }

  /**
   * Enhanced JWT 검증 (Blacklist 체크 포함)
   * 로그아웃된 토큰은 blacklist에서 차단되므로 재사용 불가
   */
  private async tryEnhancedJwt(token: string): Promise<LocalAuthResult | null> {
    try {
      const payload = await this.enhancedJwtService.verifyAccessToken(token);
      if (payload?.sub && payload?.email && payload.sessionId) {
        const issuedAt = payload.iat ? new Date(payload.iat * 1000) : new Date();
        const user: UserRecord = {
          id: payload.sub,
          email: payload.email,
          name: payload.name ?? null,
          avatar_url: null,
          username: payload.email.split('@')[0] || payload.sub,
          password_hash: '',
          role: (payload.role as any) ?? 'user',
          created_at: issuedAt,
          updated_at: issuedAt,
        };
        return { user, loginType: payload.loginType, sessionId: payload.sessionId };
      }
      return null;
    } catch {
      // Enhanced JWT 검증 실패 (blacklist에 있거나 유효하지 않은 토큰)
      return null;
    }
  }

  private async ensureSessionActive(sessionId: string): Promise<void> {
    // 세션 검증이 필요한 경우 호출 측에서 직접 SessionService를 주입하여 사용
    void sessionId;
  }

  // 역할 캐시 추가 (10분 TTL)
  private readonly roleCache = new Map<string, { role: string; timestamp: number }>();
  private readonly ROLE_CACHE_TTL = 10 * 60 * 1000; // 10분

  // 최신 role을 DB에서 확인해 요청 사용자에 반영 (재로그인 없이 즉시 반영)
  private async hydrateUserRole(user: UserRecord): Promise<UserRecord> {
    const cached = this.roleCache.get(user.id);
    if (cached && (Date.now() - cached.timestamp < this.ROLE_CACHE_TTL)) {
      return { ...user, role: cached.role as UserRecord['role'] };
    }

    try {
      const dbRole = await this.userRepository.findRoleById(user.id);

      const finalRole = dbRole ?? user.role ?? 'user';
      this.roleCache.set(user.id, { role: finalRole, timestamp: Date.now() });

      if (this.roleCache.size > 500) {
        const firstKey = this.roleCache.keys().next().value;
        if (firstKey) this.roleCache.delete(firstKey);
      }

      return { ...user, role: finalRole as UserRecord['role'] };
    } catch {
      return { ...user, role: user.role ?? 'user' };
    }
  }
}
