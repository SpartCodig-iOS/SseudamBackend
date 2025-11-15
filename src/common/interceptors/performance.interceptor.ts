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

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startTime = process.hrtime.bigint();

    // 요청 정보
    const method = request.method;
    const url = request.url;
    const userAgent = request.get('user-agent') || '';

    // Keep-Alive 및 캐싱 헤더 설정
    response.set({
      'Connection': 'keep-alive',
      'Keep-Alive': 'timeout=5, max=1000',
      'X-Powered-By': 'Sseduam-API',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
    });

    // API 응답에 따른 캐싱 헤더 설정
    if (method === 'GET') {
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

    return next.handle().pipe(
      tap((data) => {
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000; // 나노초를 밀리초로 변환

        // 응답 헤더에 성능 정보 추가
        response.set({
          'X-Response-Time': `${duration.toFixed(2)}ms`,
          'X-Request-ID': `req_${startTime}`,
        });

        // 느린 요청 로깅 (100ms 이상)
        if (duration > 100) {
          this.logger.warn(`Slow request detected`, {
            method,
            url,
            duration: `${duration.toFixed(2)}ms`,
            userAgent: userAgent.substring(0, 100),
            timestamp: new Date().toISOString(),
          });
        }

        // 매우 느린 요청은 더 자세히 로깅 (500ms 이상)
        if (duration > 500) {
          this.logger.error(`Very slow request`, {
            method,
            url,
            duration: `${duration.toFixed(2)}ms`,
            userAgent,
            responseSize: JSON.stringify(data || {}).length,
            timestamp: new Date().toISOString(),
          });
        }
      }),
    );
  }
}