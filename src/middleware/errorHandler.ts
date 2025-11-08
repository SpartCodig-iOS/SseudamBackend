import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodIssue } from 'zod';
import { ApiResponse } from '../types/api';
import { logger } from '../utils/logger';

const formatZodIssue = (issue: ZodIssue) => ({
  path: issue.path,
  message: issue.message,
  code: issue.code,
  expected: 'expected' in issue ? issue.expected : undefined,
  received: 'received' in issue ? issue.received : undefined,
});

export const errorHandler = (err: any, _req: Request, res: Response<ApiResponse<any>>, _next: NextFunction) => {
  if (err instanceof ZodError) {
    const issues = err.issues.map(formatZodIssue);
    logger.info('Validation failed', { issues });
    return res.status(400).json({
      code: 400,
      message: '요청 데이터 형식이 올바르지 않습니다.',
      data: { errors: issues },
    });
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  if (status >= 500) {
    logger.error('Unhandled exception', { message, stack: err?.stack });
  } else {
    logger.info('Handled error response', { status, message });
  }
  res.status(status).json({ code: status, message });
};
