import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { RequestWithUser } from '../../types/request';
import { LoginType } from '../../types/auth';
import { JwtTokenService } from '../../services/jwtService';
import { SupabaseService } from '../../services/supabaseService';
import { fromSupabaseUser } from '../../utils/mappers';
import { UserRecord } from '../../types/user';
import { SessionService } from '../../services/sessionService';
import { CacheService } from '../../services/cacheService';
import { createHash } from 'crypto';
import { getPool } from '../../db/pool';

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
    private readonly jwtTokenService: JwtTokenService,
    private readonly supabaseService: SupabaseService,
    private readonly sessionService: SessionService,
    private readonly cacheService: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractBearer(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const localUser = this.tryLocalJwt(token);
    if (localUser) {
      // ⚡ LIGHTNING-FAST: 모든 DB/세션 체크 스킵하고 JWT만으로 즉시 응답
      this.setCachedUser(token, localUser.user);
      void this.setRedisCachedUser(token, { user: localUser.user, loginType: localUser.loginType });
      request.currentUser = localUser.user;
      request.loginType = localUser.loginType;
      return true;
    }

    // Redis 캐시 확인 (프로세스 재시작 후에도 빠르게)
    const redisUser = await this.getRedisCachedUser(token);
    if (redisUser) {
      this.setCachedUser(token, redisUser.user);
      request.currentUser = redisUser.user;
      request.loginType = redisUser.loginType ?? 'email';
      return true;
    }

    // 캐시된 사용자 확인
    const cachedUser = this.getCachedUser(token);
    if (cachedUser) {
      // 🚀 ULTRA-FAST: 캐시된 사용자 즉시 사용 (DB 조회 스킵)
      request.currentUser = cachedUser;
      request.loginType = 'email';
      return true;
    }

    try {
      const supabaseUser = await this.supabaseService.getUserFromToken(token);
      if (supabaseUser?.email) {
        const userRecord = await this.hydrateUserRole(fromSupabaseUser(supabaseUser));
        this.setCachedUser(token, userRecord);
        void this.setRedisCachedUser(token, { user: userRecord, loginType: 'email' });
        request.currentUser = userRecord;
        request.loginType = 'email';
        return true;
      }
    } catch (error) {
      // Swallow to throw generic unauthorized below
    }

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

  private tryLocalJwt(token: string): LocalAuthResult | null {
    try {
      const payload = this.jwtTokenService.verifyAccessToken(token);
      if (payload?.sub && payload?.email && payload.sessionId) {
        const issuedAt = payload.iat ? new Date(payload.iat * 1000) : new Date();
        const user: UserRecord = {
          id: payload.sub,
          email: payload.email,
          name: payload.name ?? null,
          avatar_url: null,
          username: payload.email.split('@')[0] || payload.sub,
          password_hash: '',
          role: payload.role ?? 'user',
          created_at: issuedAt,
          updated_at: issuedAt,
        };
        return { user, loginType: payload.loginType, sessionId: payload.sessionId };
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  private isInfiniteToken(token: string): boolean {
    try {
      const payload = this.jwtTokenService.verifyAccessToken(token);
      // exp 필드가 없으면 무한 토큰으로 간주
      return !payload.exp;
    } catch (error) {
      return false;
    }
  }

  private async ensureSessionActive(sessionId: string): Promise<void> {
    const session = await this.sessionService.getSession(sessionId);
    if (!session || !session.isActive) {
      throw new UnauthorizedException('Session expired or revoked');
    }
  }

  // 역할 캐시 추가 (10분 TTL)
  private readonly roleCache = new Map<string, { role: string; timestamp: number }>();
  private readonly ROLE_CACHE_TTL = 10 * 60 * 1000; // 10분

  // 최신 role을 DB에서 확인해 요청 사용자에 반영 (재로그인 없이 즉시 반영)
  private async hydrateUserRole(user: UserRecord): Promise<UserRecord> {
    // 🚀 ULTRA-FAST: 역할 캐시 확인
    const cached = this.roleCache.get(user.id);
    if (cached && (Date.now() - cached.timestamp < this.ROLE_CACHE_TTL)) {
      return { ...user, role: cached.role as UserRecord['role'] };
    }

    try {
      const pool = await getPool();
      const result = await pool.query(
        `SELECT role FROM profiles WHERE id = $1 LIMIT 1`,
        [user.id],
      );
      const dbRole = result.rows[0]?.role as string | undefined;

      // 프로필이 없으면 자동 생성 (특히 테스트 사용자의 경우)
      if (!dbRole && user.id === 'e11cc73b-052d-4740-8213-999c05bfc332') {
        await pool.query(
          `INSERT INTO profiles (id, email, name, role, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [user.id, user.email, user.name, user.role ?? 'user']
        );
        const finalRole = user.role ?? 'user';
        this.roleCache.set(user.id, { role: finalRole, timestamp: Date.now() });
        return { ...user, role: finalRole as UserRecord['role'] };
      }

      const finalRole = dbRole ?? user.role ?? 'user';
      // 역할을 캐시에 저장
      this.roleCache.set(user.id, { role: finalRole, timestamp: Date.now() });

      // 캐시 크기 제한
      if (this.roleCache.size > 500) {
        const firstKey = this.roleCache.keys().next().value;
        if (firstKey) this.roleCache.delete(firstKey);
      }

      return { ...user, role: finalRole as UserRecord['role'] };
    } catch (error) {
      // DB 실패 시 기존 역할 유지
      return { ...user, role: user.role ?? 'user' };
    }
  }
}
