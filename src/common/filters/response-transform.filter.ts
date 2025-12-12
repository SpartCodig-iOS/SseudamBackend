import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';

const PRESERVE_NULL_KEYS = new Set(['avatarURL', 'avatarUrl']);

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

        // 큰 배열에 대한 압축 힌트
        if (data.data.length > 50) {
          response.set('X-Large-Response', 'true');
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

  private compactObject(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.compactObject(item));
    }

    if (obj && typeof obj === 'object') {
      if (obj instanceof Date) {
        return obj.toISOString();
      }
      const compacted: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // null, undefined, 빈 문자열 제거
        if (PRESERVE_NULL_KEYS.has(key)) {
          compacted[key] = value === undefined ? null : value;
          continue;
        }
        if (value !== null && value !== undefined && value !== '') {
          compacted[key] = this.compactObject(value);
        }
      }
      return compacted;
    }

    return obj;
  }
}
