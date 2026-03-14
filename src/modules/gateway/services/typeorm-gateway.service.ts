import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TypeOrmJwtBlacklistService } from '../../auth/services/typeorm-jwt-blacklist.service';
import { RateLimitService } from '../../cache-shared/services/rateLimitService';

export interface GatewayRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: any;
  query?: Record<string, string>;
  ip?: string;
  userAgent?: string;
}

export interface AuthenticatedUser {
  id: string;
  email?: string;
  role?: string;
  isActive: boolean;
  permissions?: string[];
}

export interface AuthenticatedRequest extends GatewayRequest {
  user: AuthenticatedUser;
  tokenId: string;
}

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
  user?: AuthenticatedUser;
  rateLimitInfo?: {
    remaining: number;
    resetTime: number;
  };
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

@Injectable()
export class TypeOrmGatewayService {
  private readonly logger = new Logger(TypeOrmGatewayService.name);

  // 인증이 필요하지 않은 경로들
  private readonly PUBLIC_PATHS = [
    '/health',
    '/metrics',
    '/ping',
    '/api-docs',
    '/api/v1/auth/login',
    '/api/v1/auth/signup',
    '/api/v1/auth/refresh',
    '/api/v1/oauth',
    '/.well-known',
    '/favicon.ico',
  ];

  // 관리자만 접근 가능한 경로들
  private readonly ADMIN_PATHS = [
    '/api/v1/admin',
    '/api/v1/gateway/stats',
    '/api/v1/gateway/block-ip',
    '/api/v1/gateway/lock-account',
  ];

  constructor(
    private readonly jwtService: JwtService,
    private readonly blacklistService: TypeOrmJwtBlacklistService,
    private readonly rateLimitService: RateLimitService
  ) {}

  /**
   * 요청 검증의 메인 진입점
   */
  async validateRequest(request: GatewayRequest): Promise<ValidationResult> {
    try {
      // 1. 공개 경로 체크
      if (this.isPublicPath(request.path)) {
        return { allowed: true };
      }

      // 2. Rate Limiting 체크
      const rateLimitResult = await this.checkRateLimit(request);
      if (!rateLimitResult.allowed) {
        return rateLimitResult;
      }

      // 3. 인증 체크
      const authResult = await this.authenticateRequest(request);
      if (!authResult.allowed) {
        return authResult;
      }

      // 4. 권한 체크
      const authzResult = await this.authorizeRequest(request, authResult.user!);
      if (!authzResult.allowed) {
        return authzResult;
      }

      // 5. 사용자 상태 체크
      const userStatusResult = await this.checkUserStatus(authResult.user!);
      if (!userStatusResult.allowed) {
        return userStatusResult;
      }

      return {
        allowed: true,
        user: authResult.user,
        rateLimitInfo: rateLimitResult.rateLimitInfo,
      };

    } catch (error) {
      this.logger.error('Gateway validation error:', error);
      return {
        allowed: false,
        reason: 'Internal gateway error',
      };
    }
  }

  /**
   * 공개 경로인지 확인
   */
  private isPublicPath(path: string): boolean {
    return this.PUBLIC_PATHS.some(publicPath => path.startsWith(publicPath));
  }

  /**
   * Rate Limiting 체크
   */
  private async checkRateLimit(request: GatewayRequest): Promise<ValidationResult> {
    try {
      const key = `rate_limit:${request.ip}:${request.path}`;
      const limit = this.getRateLimitForPath(request.path);
      const window = 60 * 1000; // 1분 (밀리초)

      const result = await this.rateLimitService.checkLimit(key, limit, window);

      return {
        allowed: result.allowed,
        reason: result.allowed ? undefined : `Rate limit exceeded`,
        rateLimitInfo: {
          remaining: result.remaining,
          resetTime: Math.floor(Date.now() / 1000) + 60, // 현재시간 + 60초 (Unix timestamp)
        },
      };
    } catch (error) {
      this.logger.error('Rate limit check failed:', error);
      // Rate limiting 실패 시에는 요청을 허용 (서비스 가용성 우선)
      return { allowed: true };
    }
  }

  /**
   * 경로별 Rate Limit 설정
   */
  private getRateLimitForPath(path: string): number {
    // 로그인 관련 경로는 더 엄격한 제한
    if (path.includes('/auth/login') || path.includes('/oauth')) {
      return 5; // 분당 5회
    }

    // 민감한 작업들
    if (path.includes('/auth') || path.includes('/admin')) {
      return 20; // 분당 20회
    }

    // 일반 API
    return 100; // 분당 100회
  }

  /**
   * 요청 인증
   */
  private async authenticateRequest(request: GatewayRequest): Promise<ValidationResult> {
    const token = this.extractBearerToken(request.headers.authorization);

    if (!token) {
      return {
        allowed: false,
        reason: 'Missing authorization token',
      };
    }

    try {
      // JWT 토큰 검증
      const payload = this.jwtService.verify<JwtPayload>(token, {
        issuer: 'sseudam-backend',
        audience: 'sseudam-app',
      });

      if (!payload.sub || !payload.jti) {
        return {
          allowed: false,
          reason: 'Invalid token payload',
        };
      }

      // 블랙리스트 체크
      if (await this.blacklistService.isBlacklisted(payload.jti)) {
        return {
          allowed: false,
          reason: 'Token has been revoked',
        };
      }

      // JWT payload에서 사용자 정보 사용 (DB 조회 없이 성능 향상)
      const authenticatedUser: AuthenticatedUser = {
        id: payload.sub,
        email: payload.email,
        role: payload.role || 'user',
        isActive: true, // JWT가 유효하면 활성 상태로 간주
        permissions: [],
      };

      return {
        allowed: true,
        user: authenticatedUser,
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.debug(`Token validation failed: ${errorMessage}`);
      return {
        allowed: false,
        reason: 'Invalid or expired token',
      };
    }
  }

  /**
   * Bearer 토큰 추출
   */
  private extractBearerToken(authorization?: string): string | null {
    if (!authorization) return null;

    const [type, token] = authorization.split(' ');
    if (type !== 'Bearer' || !token) return null;

    return token;
  }

  /**
   * 요청 권한 확인
   */
  private async authorizeRequest(
    request: GatewayRequest,
    user: AuthenticatedUser
  ): Promise<ValidationResult> {
    // 관리자 경로 체크
    if (this.isAdminPath(request.path)) {
      if (user.role !== 'admin') {
        return {
          allowed: false,
          reason: 'Admin privileges required',
        };
      }
    }

    // 추가 권한 체크 로직
    const hasRequiredPermission = this.checkPathPermissions(request.path, user);
    if (!hasRequiredPermission) {
      return {
        allowed: false,
        reason: 'Insufficient permissions',
      };
    }

    return { allowed: true };
  }

  /**
   * 관리자 경로인지 확인
   */
  private isAdminPath(path: string): boolean {
    return this.ADMIN_PATHS.some(adminPath => path.startsWith(adminPath));
  }

  /**
   * 경로별 권한 확인
   */
  private checkPathPermissions(path: string, user: AuthenticatedUser): boolean {
    // 기본적으로 인증된 사용자는 모든 경로에 접근 가능
    // 필요에 따라 세분화된 권한 체크 로직 추가

    // 예시: 특정 경로별 권한 체크
    if (path.startsWith('/api/v1/travels') && path.includes('/delete')) {
      return user.permissions?.includes('travel:delete') || user.role === 'admin';
    }

    if (path.startsWith('/api/v1/users') && !path.includes('/me')) {
      return user.permissions?.includes('user:read') || user.role === 'admin';
    }

    return true;
  }

  /**
   * 사용자 상태 확인
   */
  private async checkUserStatus(user: AuthenticatedUser): Promise<ValidationResult> {
    if (!user.isActive) {
      return {
        allowed: false,
        reason: 'Account has been deactivated',
      };
    }

    // 추가 사용자 상태 체크 (계정 잠금, 이메일 인증 등)
    // 필요에 따라 확장

    return { allowed: true };
  }

  /**
   * 인증 통계 조회 (관리자용)
   */
  async getAuthStats(): Promise<{
    totalRequests: number;
    authenticatedRequests: number;
    rejectedRequests: number;
    topRejectionReasons: Record<string, number>;
  }> {
    try {
      // 실제 구현에서는 메트릭 서비스나 로그 분석을 통해 수집
      // 여기서는 기본값 반환
      return {
        totalRequests: 0,
        authenticatedRequests: 0,
        rejectedRequests: 0,
        topRejectionReasons: {},
      };
    } catch (error) {
      this.logger.error('Failed to get auth stats:', error);
      throw error;
    }
  }

  /**
   * IP 주소 차단 (Rate Limiting으로 구현)
   */
  async blockIP(ip: string, reason: string, duration?: number): Promise<void> {
    try {
      const key = `blocked_ip:${ip}`;
      const ttl = duration || 3600; // 기본 1시간

      // Rate limit을 0으로 설정하여 차단 효과
      this.rateLimitService.consume(key, 0, ttl * 1000);
      this.logger.warn(`IP blocked: ${ip} (reason: ${reason}, duration: ${ttl}s)`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to block IP ${ip}:`, errorMessage);
      throw error;
    }
  }

  /**
   * 사용자 계정 잠금
   */
  async lockAccount(userId: string, reason: string): Promise<void> {
    try {
      // 사용자의 모든 토큰 블랙리스트 처리
      await this.blacklistService.blacklistAllUserTokens(userId, 'admin');

      this.logger.warn(`Account tokens blacklisted: ${userId} (reason: ${reason})`);
    } catch (error) {
      this.logger.error(`Failed to lock account ${userId}:`, error);
      throw error;
    }
  }
}