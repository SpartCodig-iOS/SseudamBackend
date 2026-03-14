import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { TypeOrmJwtBlacklistService } from '../../auth/services/typeorm-jwt-blacklist.service';
import { RequestContext } from '../../../common/context/request-context';

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

export interface AuthenticatedUser {
  id: string;
  email?: string;
  role?: string;
  tokenId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      tokenId?: string;
    }
  }
}

@Injectable()
export class GatewayAuthGuard implements CanActivate {
  private readonly logger = new Logger(GatewayAuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly blacklistService: TypeOrmJwtBlacklistService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    try {
      // 1. Authorization 헤더에서 토큰 추출
      const token = this.extractTokenFromHeader(request);
      if (!token) {
        this.logger.debug('No token found in request');
        throw new UnauthorizedException('Access token is required');
      }

      // 2. JWT 토큰 검증
      const payload = await this.validateToken(token);
      if (!payload) {
        this.logger.debug('Invalid token');
        throw new UnauthorizedException('Invalid access token');
      }

      // 3. 토큰이 블랙리스트에 있는지 확인
      if (await this.isTokenBlacklisted(payload.jti)) {
        this.logger.debug(`Token ${payload.jti} is blacklisted`);
        throw new UnauthorizedException('Token has been revoked');
      }

      // 4. 사용자 정보를 request에 저장
      const user: AuthenticatedUser = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        tokenId: payload.jti,
      };

      request.user = user;
      request.tokenId = payload.jti;

      // 5. RequestContext에 사용자 ID 설정
      RequestContext.setUserId(user.id);

      this.logger.debug(`User authenticated: ${user.id} (token: ${payload.jti})`);
      return true;

    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.debug(`Authentication failed: ${error.message}`);
      } else {
        this.logger.debug('Authentication failed');
      }

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Authentication failed');
    }
  }

  /**
   * Authorization 헤더에서 Bearer 토큰 추출
   */
  private extractTokenFromHeader(request: Request): string | null {
    const authorization = request.headers.authorization;

    if (!authorization) {
      return null;
    }

    const [type, token] = authorization.split(' ');

    if (type !== 'Bearer' || !token) {
      return null;
    }

    return token;
  }

  /**
   * JWT 토큰 검증
   */
  private async validateToken(token: string): Promise<JwtPayload | null> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        issuer: 'sseudam-backend',
        audience: 'sseudam-app',
      });

      // 기본적인 payload 검증
      if (!payload.sub || !payload.jti) {
        this.logger.warn('Token payload missing required fields');
        return null;
      }

      // 토큰 만료 확인 (이미 jwt.verify에서 처리되지만 추가 확인)
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        this.logger.debug('Token has expired');
        return null;
      }

      return payload;

    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name === 'JsonWebTokenError') {
          this.logger.debug('Invalid JWT token');
        } else if (error.name === 'TokenExpiredError') {
          this.logger.debug('JWT token has expired');
        } else {
          this.logger.debug(`JWT verification error: ${error.message}`);
        }
      } else {
        this.logger.debug('JWT verification failed');
      }
      return null;
    }
  }

  /**
   * 토큰이 블랙리스트에 있는지 확인
   */
  private async isTokenBlacklisted(tokenId: string): Promise<boolean> {
    try {
      return await this.blacklistService.isBlacklisted(tokenId);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to check blacklist for token ${tokenId}:`, errorMessage);
      // 에러 발생 시 안전을 위해 블랙리스트로 간주
      return true;
    }
  }
}