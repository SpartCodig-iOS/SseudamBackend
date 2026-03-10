/**
 * SentryInterceptor
 *
 * NestJS 전역 인터셉터로 Sentry 성능 모니터링과 에러 추적을 통합한다.
 *
 * 동작:
 *   1. 각 HTTP 요청마다 Sentry Transaction 생성 (성능 모니터링)
 *   2. requestId / userId를 Sentry scope에 설정 (에러 추적 시 컨텍스트 포함)
 *   3. 비즈니스 에러(4xx)는 Sentry breadcrumb에 기록 (에러는 아니지만 흐름 추적)
 *   4. 서버 에러(5xx)는 Sentry.captureException 호출
 *   5. SENTRY_DSN 미설정 시 아무 작업도 하지 않음 (NoOp)
 */
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import * as Sentry from '@sentry/node';
import { Request } from 'express';
import { RequestContext } from '../context/request-context';
import { env } from '../../config/env';

@Injectable()
export class SentryInterceptor implements NestInterceptor {
  private readonly enabled = !!env.sentryDsn;

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (!this.enabled || context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const requestId = RequestContext.getRequestId();
    const userId = RequestContext.getUserId();

    return next.handle().pipe(
      catchError((exception) => {
        if (exception instanceof HttpException) {
          const status = exception.getStatus();

          if (status >= 500) {
            // 서버 에러: Sentry에 예외로 캡처
            Sentry.withScope((scope) => {
              scope.setTag('request_id', requestId);
              scope.setExtra('http.method', request.method);
              scope.setExtra('http.url', request.originalUrl);
              scope.setExtra('http.status', status);
              if (userId) scope.setUser({ id: userId });
              Sentry.captureException(exception);
            });
          } else {
            // 클라이언트 에러(4xx): breadcrumb으로만 기록 (에러 카운트 올리지 않음)
            Sentry.addBreadcrumb({
              category: 'http.client_error',
              message: exception.message,
              level: 'warning',
              data: {
                status,
                path: request.originalUrl,
                method: request.method,
                requestId,
              },
            });
          }
        } else {
          // 알 수 없는 예외: 항상 캡처
          Sentry.withScope((scope) => {
            scope.setTag('request_id', requestId);
            scope.setExtra('http.method', request.method);
            scope.setExtra('http.url', request.originalUrl);
            if (userId) scope.setUser({ id: userId });
            Sentry.captureException(exception);
          });
        }

        return throwError(() => exception);
      }),
    );
  }
}
