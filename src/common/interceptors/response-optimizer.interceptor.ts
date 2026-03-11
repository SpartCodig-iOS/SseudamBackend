import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request, Response } from 'express';
import { createHash } from 'crypto';

// ────────────────────────────────────────────────────────────
// 타입 정의
// ────────────────────────────────────────────────────────────

type PlainObject = Record<string, unknown>;

// ────────────────────────────────────────────────────────────
// ResponseOptimizerInterceptor
// ────────────────────────────────────────────────────────────

/**
 * API 응답 최적화 인터셉터
 *
 * 기능:
 *  1. Sparse Fieldsets - ?fields=id,name 으로 응답 필드를 선택적으로 반환
 *  2. ETag 기반 조건부 응답 - 304 Not Modified 처리
 *  3. null/undefined 필드 제거 옵션 (?compact=true)
 *  4. 응답 크기 로깅 (설정된 임계값 초과 시 경고)
 *
 * 사용 예:
 *   GET /api/v1/travels?fields=id,title,status
 *   GET /api/v1/travels?compact=true
 */
@Injectable()
export class ResponseOptimizerInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ResponseOptimizerInterceptor.name);

  /** 응답 크기 경고 임계값 (bytes) */
  private readonly WARN_SIZE_BYTES = 100 * 1024; // 100 KB
  /** ETag 생성을 적용할 최대 응답 크기 (bytes) - 너무 큰 응답은 건너뜀 */
  private readonly ETAG_MAX_BYTES = 500 * 1024; // 500 KB

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const fields = this.parseFields(request.query['fields']);
    const compact = request.query['compact'] === 'true';
    const ifNoneMatch = request.headers['if-none-match'] as string | undefined;

    return next.handle().pipe(
      map((data: unknown) => {
        if (response.headersSent) return data;

        // 1. Sparse Fieldsets 적용
        let processed = fields.length > 0 ? this.applyFieldSelection(data, fields) : data;

        // 2. compact 모드: null·undefined 필드 제거
        if (compact) {
          processed = this.removeNullFields(processed);
        }

        // 3. ETag 생성 및 304 조건부 응답
        if (request.method === 'GET') {
          const serialized = this.safeStringify(processed);
          const byteSize = Buffer.byteLength(serialized, 'utf8');

          // 크기 경고
          if (byteSize > this.WARN_SIZE_BYTES) {
            this.logger.warn(
              `Large response detected: ${request.method} ${request.path} => ${(byteSize / 1024).toFixed(1)} KB`,
            );
          }

          if (byteSize <= this.ETAG_MAX_BYTES) {
            const etag = this.generateETag(serialized);
            response.setHeader('ETag', etag);
            response.setHeader('X-Response-Size', `${byteSize}`);

            // 304 Not Modified
            if (ifNoneMatch && ifNoneMatch === etag && !response.headersSent) {
              response.status(304).end();
              return null; // rxjs가 더 이상 처리하지 않도록
            }
          }
        }

        return processed;
      }),
    );
  }

  // ── Sparse Fieldsets ──────────────────────────────────────

  /**
   * ?fields=id,title,status  =>  ['id', 'title', 'status']
   * 중첩 필드는 점 표기법 지원: ?fields=id,members.name
   */
  private parseFields(raw: unknown): string[] {
    if (typeof raw !== 'string' || raw.trim() === '') return [];
    return raw
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);
  }

  /**
   * data 에서 허용된 fields 만 남깁니다.
   * - 최상위 객체: 직접 필터링
   * - 배열: 각 원소에 재귀 적용
   * - 중첩 필드: 점 표기법 (members.name -> members 배열 내 name 만 유지)
   */
  private applyFieldSelection(data: unknown, fields: string[]): unknown {
    if (Array.isArray(data)) {
      return data.map((item) => this.applyFieldSelection(item, fields));
    }

    if (data !== null && typeof data === 'object') {
      const obj = data as PlainObject;
      const result: PlainObject = {};

      // 최상위 필드와 중첩 필드 분리
      const topFields = fields.filter((f) => !f.includes('.'));
      const nestedFields = fields.filter((f) => f.includes('.'));

      // 최상위 필드 복사
      for (const field of topFields) {
        if (field in obj) {
          result[field] = obj[field];
        }
      }

      // 중첩 필드 처리 (예: members.name)
      const nestedGroups = this.groupNestedFields(nestedFields);
      for (const [parent, childFields] of nestedGroups) {
        if (parent in obj) {
          result[parent] = this.applyFieldSelection(obj[parent], childFields);
        }
      }

      // 필드를 아무것도 지정하지 않은 경우 원본 반환 (안전 처리)
      return Object.keys(result).length > 0 ? result : obj;
    }

    return data;
  }

  /**
   * ['members.name', 'members.role', 'owner.id']
   *   -> Map { 'members' -> ['name', 'role'], 'owner' -> ['id'] }
   */
  private groupNestedFields(fields: string[]): Map<string, string[]> {
    const groups = new Map<string, string[]>();
    for (const field of fields) {
      const dotIndex = field.indexOf('.');
      const parent = field.slice(0, dotIndex);
      const child = field.slice(dotIndex + 1);
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent)!.push(child);
    }
    return groups;
  }

  // ── Compact Mode ──────────────────────────────────────────

  private removeNullFields(data: unknown): unknown {
    if (Array.isArray(data)) {
      return data.map((item) => this.removeNullFields(item));
    }
    if (data !== null && typeof data === 'object') {
      const result: PlainObject = {};
      for (const [key, value] of Object.entries(data as PlainObject)) {
        if (value !== null && value !== undefined) {
          result[key] = this.removeNullFields(value);
        }
      }
      return result;
    }
    return data;
  }

  // ── ETag ──────────────────────────────────────────────────

  /**
   * 응답 본문의 SHA-256 해시를 Weak ETag 형식으로 반환합니다.
   * W/"<hash[:16]>"
   */
  private generateETag(content: string): string {
    const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
    return `W/"${hash}"`;
  }

  private safeStringify(data: unknown): string {
    try {
      return JSON.stringify(data);
    } catch {
      return String(data);
    }
  }
}
