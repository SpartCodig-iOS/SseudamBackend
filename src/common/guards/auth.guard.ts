import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { RequestWithUser } from '../../types/request';
import { LoginType } from '../../types/auth';
import { JwtTokenService } from '../../services/jwtService';
import { SupabaseService } from '../../services/supabaseService';
import { fromSupabaseUser } from '../../utils/mappers';
import { UserRecord } from '../../types/user';
import { SessionService } from '../../services/sessionService';

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

  constructor(
    private readonly jwtTokenService: JwtTokenService,
    private readonly supabaseService: SupabaseService,
    private readonly sessionService: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractBearer(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const localUser = this.tryLocalJwt(token);
    if (localUser) {
      await this.ensureSessionActive(localUser.sessionId);
      request.currentUser = localUser.user;
      request.loginType = localUser.loginType;
      return true;
    }

    // 캐시된 사용자 확인
    const cachedUser = this.getCachedUser(token);
    if (cachedUser) {
      request.currentUser = cachedUser;
      request.loginType = 'email';
      return true;
    }

    try {
      const supabaseUser = await this.supabaseService.getUserFromToken(token);
      if (supabaseUser?.email) {
        const userRecord = fromSupabaseUser(supabaseUser);
        this.setCachedUser(token, userRecord);
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

  private async ensureSessionActive(sessionId: string): Promise<void> {
    const session = await this.sessionService.getSession(sessionId);
    if (!session || !session.isActive) {
      throw new UnauthorizedException('Session expired or revoked');
    }
  }
}
