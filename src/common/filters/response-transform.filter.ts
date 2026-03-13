import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';

const PRESERVE_NULL_KEYS = new Set([
  'avatarURL', 'avatarUrl', 'email', 'name',
  // 정산/금융 관련 필드 - 0 값도 보존해야 함
  'totalExpenseAmount', 'myPaidAmount', 'mySharedAmount', 'myBalance',
  'balance', 'amount', 'convertedAmount', 'memberBalances', 'balanceStatus',
  'splitAmount', 'paidAmount', 'sharedAmount', 'totalPaid', 'totalShared',
  'expenseAmount', 'currency', 'originalAmount', 'exchangeRate',
  // 차트 관련 필드들
  'data', 'datasets', 'labels', 'values', 'chartData', 'series', 'categories',
  'expenses', 'members', 'items', 'participants', 'splits',
  // 기타 중요 필드
  'baseCurrency', 'countryCode', 'countryNameKr', 'createdAt', 'inviteCode'
]);

interface OptimizedResponse {
  code: number;
  message: string;
  data: any;
  meta?: {
    timestamp: string;
    responseTime?: string;
    requestId?: string;
    cached?: boolean;
  };
}

@Injectable()
export class ResponseTransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const response = context.switchToHttp().getResponse<Response>();
    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      map((data: any) => {
        // 이미 변환된 응답은 그대로 반환
        if (data && typeof data === 'object' && data.code !== undefined) {
          return this.optimizeResponse(data, response, request);
        }

        // Raw 데이터를 표준 형식으로 변환
        const transformedResponse: OptimizedResponse = {
          code: 200,
          message: 'Success',
          data: data || {},
          meta: {
            timestamp: new Date().toISOString(),
            requestId: response.get('X-Request-ID'),
          },
        };

        return this.optimizeResponse(transformedResponse, response, request);
      }),
    );
  }

  private optimizeResponse(data: any, response: Response, request: any): any {
    // 메타 정보 추가
    if (data && typeof data === 'object') {
      data.meta = {
        ...data.meta,
        responseTime: response.get('X-Response-Time'),
        requestId: response.get('X-Request-ID'),
        cached: !!response.get('X-Cache-Hit'),
      };

      // 민감한 정보 제거 (production 환경에서)
      if (process.env.NODE_ENV === 'production') {
        this.sanitizeResponse(data);
      }

      // 페이지네이션이 있는 응답에 대한 최적화
      if (Array.isArray(data.data)) {
        data.meta = {
          ...data.meta,
          count: data.data.length,
        };

        // 큰 배열에 대한 압축 힌트 (헤더가 이미 전송되지 않은 경우에만)
        if (data.data.length > 50 && !response.headersSent) {
          try {
            response.set('X-Large-Response', 'true');
          } catch (error) {
            // 헤더 설정 실패 시 무시
          }
        }
      }

      // 빈 객체나 배열 최적화
      if (data.data && typeof data.data === 'object') {
        data.data = this.compactObject(data.data);
      }
    }

    return data;
  }

  private sanitizeResponse(data: any): void {
    // 스택 트레이스나 내부 정보 제거
    if (data.error) {
      delete data.error.stack;
      delete data.error.sql;
    }

    // 디버그 정보 제거
    if (data.debug) {
      delete data.debug;
    }
  }

  private compactObject(obj: any, seen: WeakSet<object> = new WeakSet()): any {
    if (Array.isArray(obj)) {
      // 빈 배열도 보존 (차트 데이터를 위해)
      return obj.map(item => this.compactObject(item, seen));
    }

    if (obj && typeof obj === 'object') {
      if (obj instanceof Date) {
        return obj.toISOString();
      }

      // 순환 참조 감지 — 이미 방문한 객체는 빈 객체로 대체
      if (seen.has(obj)) {
        return {};
      }
      seen.add(obj);

      const compacted: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const normalizedKey = key.trim();

        if (PRESERVE_NULL_KEYS.has(normalizedKey)) {
          compacted[normalizedKey] = value === undefined ? null : value;
          continue;
        }

        if (typeof value === 'string' && value.trim() !== '') {
          const parsed = Number(value.trim());
          if (Number.isFinite(parsed)) {
            compacted[normalizedKey] = parsed;
            continue;
          }
        }

        // 숫자 0은 유효한 값으로 보존 (금융 데이터 중요)
        if (typeof value === 'number' && Number.isFinite(value)) {
          compacted[normalizedKey] = value;
          continue;
        }

        // 배열은 빈 배열이라도 보존 (차트 데이터를 위해)
        if (Array.isArray(value)) {
          compacted[normalizedKey] = this.compactObject(value, seen);
          continue;
        }

        // null, undefined, 빈 문자열 제거 (단, 숫자와 배열은 제외)
        if (value !== null && value !== undefined && value !== '') {
          compacted[normalizedKey] = this.compactObject(value, seen);
        }
      }
      return compacted;
    }

    return obj;
  }
}
