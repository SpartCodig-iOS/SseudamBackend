import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { Request, Response } from 'express';

export interface OptimizedResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  timestamp: string;
  requestId?: string;
  meta?: {
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    performance?: {
      executionTime: number;
      cacheHit?: boolean;
    };
  };
}

@Injectable()
export class ResponseOptimizerInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ResponseOptimizerInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startTime = Date.now();

    // 요청 ID 생성 (correlation ID가 있으면 사용)
    const requestId = (request as any).correlationId || this.generateRequestId();

    return next.handle().pipe(
      map((data) => this.optimizeResponse(data, request, startTime, requestId)),
      tap((optimizedData) => {
        this.setResponseHeaders(response, optimizedData, requestId);
        this.logResponse(request, optimizedData, Date.now() - startTime);
      })
    );
  }

  /**
   * 응답 최적화
   */
  private optimizeResponse(
    data: any,
    request: Request,
    startTime: number,
    requestId: string
  ): OptimizedResponse {
    // 이미 최적화된 응답인 경우 그대로 반환
    if (this.isOptimizedResponse(data)) {
      return {
        ...data,
        requestId,
        meta: {
          ...data.meta,
          performance: {
            ...data.meta?.performance,
            executionTime: Date.now() - startTime,
          },
        },
      };
    }

    // null 또는 undefined 처리
    if (data == null) {
      return {
        success: true,
        data: null,
        timestamp: new Date().toISOString(),
        requestId,
        meta: {
          performance: {
            executionTime: Date.now() - startTime,
          },
        },
      };
    }

    // 배열 데이터 처리 (페이지네이션 감지)
    if (Array.isArray(data)) {
      return this.handleArrayResponse(data, request, startTime, requestId);
    }

    // 페이지네이션 객체 감지
    if (this.isPaginatedResponse(data)) {
      return this.handlePaginatedResponse(data, request, startTime, requestId);
    }

    // 일반 객체 응답
    return {
      success: true,
      data: this.sanitizeData(data),
      timestamp: new Date().toISOString(),
      requestId,
      meta: {
        performance: {
          executionTime: Date.now() - startTime,
        },
      },
    };
  }

  /**
   * 배열 응답 처리
   */
  private handleArrayResponse(
    data: any[],
    request: Request,
    startTime: number,
    requestId: string
  ): OptimizedResponse {
    const query = request.query;
    const page = parseInt(query.page as string, 10) || 1;
    const limit = parseInt(query.limit as string, 10) || data.length;

    return {
      success: true,
      data: data.map((item: any) => this.sanitizeData(item)),
      timestamp: new Date().toISOString(),
      requestId,
      meta: {
        pagination: {
          page,
          limit,
          total: data.length,
          totalPages: Math.ceil(data.length / limit),
        },
        performance: {
          executionTime: Date.now() - startTime,
        },
      },
    };
  }

  /**
   * 페이지네이션 응답 처리
   */
  private handlePaginatedResponse(
    data: any,
    request: Request,
    startTime: number,
    requestId: string
  ): OptimizedResponse {
    return {
      success: true,
      data: Array.isArray(data.items)
        ? data.items.map((item: any) => this.sanitizeData(item))
        : this.sanitizeData(data.items),
      timestamp: new Date().toISOString(),
      requestId,
      meta: {
        pagination: {
          page: data.page || 1,
          limit: data.limit || 10,
          total: data.total || 0,
          totalPages: data.totalPages || 0,
        },
        performance: {
          executionTime: Date.now() - startTime,
        },
      },
    };
  }

  /**
   * 데이터 정제 (민감한 정보 제거)
   */
  private sanitizeData(data: any): any {
    if (data == null || typeof data !== 'object') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeData(item));
    }

    const sanitized = { ...data };
    const sensitiveFields = [
      'password',
      'passwordHash',
      'secret',
      'token',
      'privateKey',
      'accessKey',
      'secretKey',
      'apiKey',
      'refreshToken',
    ];

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    // 중첩 객체 처리
    for (const key in sanitized) {
      if (sanitized[key] && typeof sanitized[key] === 'object') {
        sanitized[key] = this.sanitizeData(sanitized[key]);
      }
    }

    return sanitized;
  }

  /**
   * 응답 헤더 설정
   */
  private setResponseHeaders(
    response: Response,
    data: OptimizedResponse,
    requestId: string
  ): void {
    // CORS 및 보안 헤더
    response.setHeader('X-Request-ID', requestId);
    response.setHeader('X-Response-Time', data.meta?.performance?.executionTime || 0);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');

    // 캐시 헤더 (API 응답은 기본적으로 캐시하지 않음)
    if (!response.getHeader('Cache-Control')) {
      response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      response.setHeader('Pragma', 'no-cache');
      response.setHeader('Expires', '0');
    }

    // 페이지네이션 헤더
    if (data.meta?.pagination) {
      const { page, limit, total, totalPages } = data.meta.pagination;
      response.setHeader('X-Total-Count', total);
      response.setHeader('X-Page', page);
      response.setHeader('X-Per-Page', limit);
      response.setHeader('X-Total-Pages', totalPages);
    }
  }

  /**
   * 응답 로깅
   */
  private logResponse(
    request: Request,
    data: OptimizedResponse,
    executionTime: number
  ): void {
    const { method, url } = request;
    const dataSize = JSON.stringify(data).length;

    this.logger.debug({
      method,
      url,
      executionTime,
      dataSize,
      success: data.success,
      requestId: data.requestId,
    });

    // 느린 요청 경고
    if (executionTime > 1000) {
      this.logger.warn(`Slow request detected: ${method} ${url} took ${executionTime}ms`);
    }

    // 큰 응답 경고
    if (dataSize > 1000000) { // 1MB
      this.logger.warn(`Large response detected: ${method} ${url} response size ${dataSize} bytes`);
    }
  }

  /**
   * 최적화된 응답 여부 확인
   */
  private isOptimizedResponse(data: any): data is OptimizedResponse {
    return (
      data &&
      typeof data === 'object' &&
      typeof data.success === 'boolean' &&
      typeof data.timestamp === 'string'
    );
  }

  /**
   * 페이지네이션 응답 여부 확인
   */
  private isPaginatedResponse(data: any): boolean {
    return (
      data &&
      typeof data === 'object' &&
      'items' in data &&
      ('total' in data || 'page' in data || 'limit' in data)
    );
  }

  /**
   * 요청 ID 생성
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}