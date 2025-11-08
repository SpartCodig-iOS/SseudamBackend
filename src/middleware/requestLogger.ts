import { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger';

const toMilliseconds = (start: bigint) => {
  const diff = Number(process.hrtime.bigint() - start);
  return Math.round((diff / 1_000_000) * 100) / 100;
};

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
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
};
