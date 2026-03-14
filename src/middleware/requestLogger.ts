import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { RequestContext } from '../common/context/request-context';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();
    const requestId = randomUUID();

    // Set request ID header for response
    res.setHeader('X-Request-ID', requestId);

    // Run in request context
    RequestContext.run({ requestId }, () => {
      // Log request
      console.log(`[${requestId}] ${req.method} ${req.url} - Start`);

      // Capture response when it finishes
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        console.log(`[${requestId}] ${req.method} ${req.url} - ${res.statusCode} ${duration}ms`);
      });

      next();
    });
  }
}