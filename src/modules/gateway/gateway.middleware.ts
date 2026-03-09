import { Injectable, NestMiddleware, Logger, UnauthorizedException, ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { GatewayService, GatewayRequest, AuthenticatedRequest } from './gateway.service';

// Express Request 타입 확장
declare global {
  namespace Express {
    interface Request {
      gatewayUser?: AuthenticatedRequest['user'];
      gatewayValidation?: {
        allowed: boolean;
        reason?: string;
        rateLimitInfo?: {
          remaining: number;
          resetTime: number;
        };
      };
    }
  }
}

@Injectable()
export class GatewayMiddleware implements NestMiddleware {
  private readonly logger = new Logger(GatewayMiddleware.name);

  constructor(private readonly gatewayService: GatewayService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();

    try {
      // Gateway 요청 객체 생성
      const gatewayRequest: GatewayRequest = {
        method: req.method,
        path: req.path,
        headers: req.headers as Record<string, string>,
        body: req.body,
        query: req.query as Record<string, string>,
        ip: this.getClientIP(req),
        userAgent: req.get('User-Agent'),
      };

      // Gateway 서비스로 요청 검증
      const validationResult = await this.gatewayService.validateRequest(gatewayRequest);

      // Rate Limit 헤더 설정
      if (validationResult.rateLimitInfo) {
        res.setHeader('X-RateLimit-Remaining', validationResult.rateLimitInfo.remaining.toString());
        res.setHeader('X-RateLimit-Reset', validationResult.rateLimitInfo.resetTime.toString());
      }

      // 요청 검증 결과 처리
      if (!validationResult.allowed) {
        this.handleRejectedRequest(validationResult, req, res);
        return;
      }

      // 인증된 사용자 정보를 Request 객체에 추가
      if (validationResult.user) {
        req.gatewayUser = validationResult.user;
      }

      // 검증 결과를 Request 객체에 추가 (디버깅용)
      req.gatewayValidation = {
        allowed: validationResult.allowed,
        rateLimitInfo: validationResult.rateLimitInfo,
      };

      const duration = Date.now() - startTime;
      this.logger.debug(
        `Gateway validation passed: ${req.method} ${req.path} - ${duration}ms - User: ${validationResult.user?.id || 'anonymous'}`
      );

      next();
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Gateway middleware error: ${req.method} ${req.path} - ${duration}ms`, error);

      // 에러 시 기본적으로 차단
      res.status(500).json({
        statusCode: 500,
        message: 'Gateway validation error',
        error: 'Internal Server Error',
        timestamp: new Date().toISOString(),
        path: req.path,
      });
    }
  }

  /**
   * 거부된 요청 처리
   */
  private handleRejectedRequest(
    validationResult: { allowed: boolean; reason?: string; rateLimitInfo?: any },
    req: Request,
    res: Response
  ) {
    const reason = validationResult.reason || 'Unknown rejection reason';

    this.logger.warn(
      `Gateway rejected request: ${req.method} ${req.path} - IP: ${this.getClientIP(req)} - Reason: ${reason}`
    );

    // 거부 사유별 HTTP 상태 코드 결정
    let statusCode: number;
    let errorType: string;

    if (reason.includes('Rate limit')) {
      statusCode = 429;
      errorType = 'Too Many Requests';
    } else if (reason.includes('authorization') || reason.includes('token') || reason.includes('credential')) {
      statusCode = 401;
      errorType = 'Unauthorized';
    } else if (reason.includes('privilege') || reason.includes('role') || reason.includes('permission')) {
      statusCode = 403;
      errorType = 'Forbidden';
    } else if (reason.includes('Route not found')) {
      statusCode = 404;
      errorType = 'Not Found';
    } else if (reason.includes('suspicious') || reason.includes('locked') || reason.includes('anomalous')) {
      statusCode = 403;
      errorType = 'Forbidden';
    } else {
      statusCode = 400;
      errorType = 'Bad Request';
    }

    // 표준화된 에러 응답
    res.status(statusCode).json({
      statusCode,
      message: reason,
      error: errorType,
      timestamp: new Date().toISOString(),
      path: req.path,
      ...(validationResult.rateLimitInfo && {
        rateLimitInfo: validationResult.rateLimitInfo,
      }),
    });
  }

  /**
   * 클라이언트 IP 주소 추출 (프록시 고려)
   */
  private getClientIP(req: Request): string {
    return (
      req.get('cf-connecting-ip') || // Cloudflare
      req.get('x-real-ip') ||        // Nginx
      req.get('x-forwarded-for')?.split(',')[0] || // Load balancer
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      'unknown'
    );
  }
}

/**
 * Gateway에서 인증된 사용자 정보를 가져오는 헬퍼 함수
 */
export function getGatewayUser(req: Request): AuthenticatedRequest['user'] | undefined {
  return req.gatewayUser;
}

/**
 * Gateway 검증 결과를 가져오는 헬퍼 함수
 */
export function getGatewayValidation(req: Request) {
  return req.gatewayValidation;
}