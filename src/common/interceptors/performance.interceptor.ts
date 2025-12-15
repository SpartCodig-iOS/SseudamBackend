import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PerformanceInterceptor.name);
  private readonly warnThresholdMs = Number(process.env.PERF_WARN_MS ?? 300);
  private readonly errorThresholdMs = Number(process.env.PERF_ERROR_MS ?? 800);
  private readonly logSampleRate = Math.min(
    1,
    Math.max(0, Number(process.env.PERF_LOG_SAMPLE ?? 1)),
  );

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startTime = process.hrtime.bigint();

    // 요청 정보
    const method = request.method;
    const url = request.url;
    const userAgent = request.get('user-agent') || '';

    // Keep-Alive 및 캐싱 헤더 설정
    if (!response.headersSent) {
      response.set({
        'Connection': 'keep-alive',
        'Keep-Alive': 'timeout=5, max=1000',
        'X-Powered-By': 'Sseduam-API',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
      });
    }

    // API 응답에 따른 캐싱 헤더 설정
    if (method === 'GET' && !response.headersSent) {
      const cacheableEndpoints = [
        '/api/v1/meta/countries',
        '/api/v1/meta/exchange-rate',
        '/health',
        '/metrics',
      ];

      const isCacheable = cacheableEndpoints.some(endpoint =>
        url.includes(endpoint)
      );

      if (isCacheable) {
        response.set({
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
          'ETag': `W/"${Date.now()}"`,
        });
      } else {
        response.set({
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        });
      }
    }

    const skipSlowLogEndpoints = ['/api/v1/meta/countries', '/api/v1/meta/exchange-rate'];
    const skipSlowLog = method === 'GET' && skipSlowLogEndpoints.some(endpoint => url.includes(endpoint));

    return next.handle().pipe(
      tap((data) => {
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000; // ms

        if (!response.headersSent) {
          response.set({
            'X-Response-Time': `${duration.toFixed(2)}ms`,
            'X-Request-ID': `req_${startTime}`,
          });
        }

        const shouldLog = Math.random() <= this.logSampleRate;

        if (!skipSlowLog && duration > this.warnThresholdMs && shouldLog) {
          this.logger.warn('Slow request detected', {
            method,
            url,
            duration: `${duration.toFixed(2)}ms`,
            userAgent: userAgent.substring(0, 100),
            timestamp: new Date().toISOString(),
          });
        }

        if (!skipSlowLog && duration > this.errorThresholdMs && shouldLog) {
          const responseSize = data ? Buffer.byteLength(JSON.stringify(data), 'utf8') : 0;
          const handlerTime = request.get('X-Handler-Time');
          const dbTime = request.get('X-DB-Time');
          const cacheTime = request.get('X-Cache-Time');
          this.logger.error('Very slow request', {
            method,
            url,
            duration: `${duration.toFixed(2)}ms`,
            userAgent,
            responseSize,
            handlerTime,
            dbTime,
            cacheTime,
            timestamp: new Date().toISOString(),
          });
        }
      }),
    );
  }
}
