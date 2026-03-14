/**
 * RequestLoggerMiddleware
 *
 * 역할:
 *  1. Correlation ID 부여 — X-Request-ID 헤더 또는 신규 UUID
 *  2. AsyncLocalStorage에 RequestContext 주입 (모든 하위 로그에 requestId 자동 포함)
 *  3. 요청/응답 구조화 로깅 (pino)
 *  4. X-Request-ID 응답 헤더 설정
 */
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { RequestContext } from '../common/context/request-context';
import { pinoLogger } from '../common/logger/pino-logger';

// Constants for string literals
const HEADERS = {
  REQUEST_ID: 'X-Request-ID',
  REQUEST_ID_LOWERCASE: 'x-request-id',
  USER_AGENT: 'user-agent',
} as const;

const EXCLUDED_PATHS = [
  '/health',
  '/health/database',
  '/health/supabase',
  '/favicon.ico',
  '/api-docs',
  '/metrics',
];

const USER_AGENT_MAX_LENGTH = 120;

function shouldSkipLogging(path: string): boolean {
  return EXCLUDED_PATHS.some((excluded) => path.startsWith(excluded));
}

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Early path exclusion to avoid expensive operations for health endpoints
    if (shouldSkipLogging(req.originalUrl)) {
      return next();
    }

    // 클라이언트가 보낸 X-Request-ID를 재사용하거나 새로 발급
    const requestId =
      (req.headers[HEADERS.REQUEST_ID_LOWERCASE] as string | undefined) ?? randomUUID();

    // 응답 헤더에 항상 포함 (클라이언트/Prometheus가 추적 가능)
    res.setHeader(HEADERS.REQUEST_ID, requestId);
    (req as any).requestId = requestId;

    // AsyncLocalStorage 컨텍스트 안에서 미들웨어 체인 실행
    RequestContext.run({ requestId }, () => {
      pinoLogger.debug('Request started', {
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
        userAgent: req.get(HEADERS.USER_AGENT)?.substring(0, USER_AGENT_MAX_LENGTH),
      });

      const finishHandler = () => {
        // Use RequestContext's built-in timing instead of custom implementation
        const durationMs = RequestContext.getElapsedMs();
        const meta = {
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          durationMs,
        };

        if (res.statusCode >= 500) {
          pinoLogger.error('Request failed', meta);
        } else if (res.statusCode >= 400) {
          pinoLogger.info('Request completed with client error', meta);
        } else {
          pinoLogger.info('Request completed', meta);
        }

        // Cleanup event listener to prevent memory leaks
        res.removeListener('finish', finishHandler);
      };

      res.on('finish', finishHandler);

      next();
    });
  }
}