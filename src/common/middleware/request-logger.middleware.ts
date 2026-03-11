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
import { RequestContext } from '../context/request-context';
import { pinoLogger } from '../logger/pino-logger';

const EXCLUDED_PATHS = [
  '/health',
  '/health/database',
  '/health/supabase',
  '/favicon.ico',
  '/api-docs',
];

function shouldSkipLogging(path: string): boolean {
  return EXCLUDED_PATHS.some((excluded) => path.startsWith(excluded));
}

const toMs = (start: bigint) =>
  Math.round((Number(process.hrtime.bigint() - start) / 1_000_000) * 100) / 100;

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // 클라이언트가 보낸 X-Request-ID를 재사용하거나 새로 발급
    const requestId =
      (req.headers['x-request-id'] as string | undefined) ?? randomUUID();

    // 응답 헤더에 항상 포함 (클라이언트/Prometheus가 추적 가능)
    res.setHeader('X-Request-ID', requestId);
    (req as any).requestId = requestId;

    // AsyncLocalStorage 컨텍스트 안에서 미들웨어 체인 실행
    RequestContext.run({ requestId }, () => {
      if (shouldSkipLogging(req.originalUrl)) {
        return next();
      }

      const start = process.hrtime.bigint();

      pinoLogger.debug('Request started', {
        method: req.method,
        path: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('user-agent')?.substring(0, 120),
      });

      res.on('finish', () => {
        const durationMs = toMs(start);
        const meta = {
          method:     req.method,
          path:       req.originalUrl,
          status:     res.statusCode,
          durationMs,
        };

        if (res.statusCode >= 500) {
          pinoLogger.error('Request failed', meta);
        } else if (res.statusCode >= 400) {
          pinoLogger.info('Request completed with client error', meta);
        } else {
          pinoLogger.info('Request completed', meta);
        }
      });

      next();
    });
  }
}
