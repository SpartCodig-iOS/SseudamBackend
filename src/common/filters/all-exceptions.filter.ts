import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import * as Sentry from '@sentry/node';
import { ZodError, ZodIssue } from 'zod';
import { logger } from '../../utils/logger';
import { env } from '../../config/env';
import { DatabaseError } from 'pg';

const formatZodIssue = (issue: ZodIssue) => ({
  path: issue.path,
  message: issue.message,
  code: issue.code,
  expected: 'expected' in issue ? issue.expected : undefined,
  received: 'received' in issue ? issue.received : undefined,
});

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private capture(exception: unknown) {
    if (!env.sentryDsn) return;
    Sentry.captureException(exception);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const normalizeDbError = (err: DatabaseError) => {
      const code = err.code;
      // PostgreSQL 에러코드 매핑 (https://www.postgresql.org/docs/current/errcodes-appendix.html)
      if (code === '23505') return { status: HttpStatus.CONFLICT, message: '이미 존재하는 데이터입니다.' };
      if (code === '23503') return { status: HttpStatus.BAD_REQUEST, message: '관련된 데이터가 남아 있어 삭제/수정할 수 없습니다.' };
      if (code === '23514') return { status: HttpStatus.BAD_REQUEST, message: '데이터 제약 조건을 위반했습니다.' };
      return null;
    };

    if (exception instanceof ZodError) {
      const issues = exception.issues.map(formatZodIssue);
      logger.info('Validation failed', { issues });
      return response.status(HttpStatus.BAD_REQUEST).json({
        code: HttpStatus.BAD_REQUEST,
        message: '요청 데이터 형식이 올바르지 않습니다.',
        data: { errors: issues },
      });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const message =
        typeof res === 'string'
          ? res
          : typeof res === 'object' && 'message' in res
            ? (res as Record<string, any>).message || exception.message
            : exception.message;

      const data = typeof res === 'object' && res && 'data' in res ? (res as any).data : [];

      if (status >= 500) {
        logger.error('Unhandled exception', { message, stack: exception.stack });
        this.capture(exception);
      } else {
        logger.info('Handled error response', { status, message });
      }

      return response.status(status).json({
        code: status,
        data,
        message,
      });
    }

    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    const message = (exception as Error)?.message || 'Internal Server Error';
    // DB 에러라면 공통 매핑 시도
    if ((exception as any)?.code && (exception as any)?.severity) {
      const mapped = normalizeDbError(exception as DatabaseError);
      if (mapped) {
        return response.status(mapped.status).json({
          code: mapped.status,
          data: [],
          message: mapped.message,
        });
      }
    }
    logger.error('Unhandled exception', { message, stack: (exception as Error)?.stack });
    this.capture(exception);

    return response.status(status).json({
      code: status,
      data: [],
      message,
    });
  }
}
