import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger';

const toMilliseconds = (start: bigint) => {
  const diff = Number(process.hrtime.bigint() - start);
  return Math.round((diff / 1_000_000) * 100) / 100;
};

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly excludedPaths = [
    '/health',
    '/health/database',
    '/health/supabase',
    '/favicon.ico',
    '/api-docs'
  ];

  private shouldSkipLogging(path: string): boolean {
    return this.excludedPaths.some(excluded => path.startsWith(excluded));
  }

  use(req: Request, res: Response, next: NextFunction) {
    // 헬스체크 및 정적 파일 요청은 로깅 제외
    if (this.shouldSkipLogging(req.originalUrl)) {
      next();
      return;
    }

    const start = process.hrtime.bigint();
    logger.debug('Request started', { method: req.method, path: req.originalUrl });

    res.on('finish', () => {
      const durationMs = toMilliseconds(start);
      const meta = {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs,
      };
      if (res.statusCode >= 500) {
        logger.error('Request failed', meta);
        return;
      }
      if (res.statusCode >= 400) {
        logger.info('Request completed with client error', meta);
        return;
      }
      logger.info('Request completed', meta);
    });

    next();
  }
}
