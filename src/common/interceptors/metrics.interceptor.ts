/**
 * MetricsInterceptor
 *
 * 모든 HTTP 요청에 대해 Prometheus 메트릭을 자동 수집한다.
 * - http_requests_total (method, status_code, route)
 * - http_request_duration_seconds (method, status_code, route)
 *
 * route는 /api/v1/travels/:id 형태로 정규화해
 * 카디널리티 폭발을 방지한다.
 */
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { Request, Response } from 'express';
import { AppMetricsService } from '../metrics/app-metrics.service';

/** UUID / 숫자 경로 파라미터를 ':id' 로 치환해 카디널리티 제한 */
function normalizeRoute(url: string): string {
  return url
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id')
    .split('?')[0]; // 쿼리스트링 제거
}

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: AppMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // HTTP 컨텍스트만 처리 (WebSocket, gRPC 등 제외)
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request  = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startTime = process.hrtime.bigint();
    const route = normalizeRoute(request.path ?? request.url);

    return next.handle().pipe(
      tap(() => {
        const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
        this.metricsService.recordHttpRequest(
          request.method,
          response.statusCode,
          route,
          durationMs,
        );
      }),
      catchError((err) => {
        const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
        // 예외 상황에서는 500으로 기록 (실제 status는 ExceptionFilter가 결정)
        const statusCode = err?.status ?? err?.statusCode ?? 500;
        this.metricsService.recordHttpRequest(
          request.method,
          statusCode,
          route,
          durationMs,
        );
        return throwError(() => err);
      }),
    );
  }
}
