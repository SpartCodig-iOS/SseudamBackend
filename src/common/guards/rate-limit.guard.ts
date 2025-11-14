import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import {
  RATE_LIMIT_METADATA_KEY,
  RateLimitOptions,
} from '../decorators/rate-limit.decorator';
import { RateLimitService } from '../../services/rateLimitService';

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_LIMIT = 5;

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const options =
      this.reflector.get<RateLimitOptions>(
        RATE_LIMIT_METADATA_KEY,
        context.getHandler(),
      ) ??
      this.reflector.get<RateLimitOptions>(
        RATE_LIMIT_METADATA_KEY,
        context.getClass(),
      );

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const ip =
      request.ip ||
      request.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
      request.connection.remoteAddress ||
      'unknown';

    const limit = options.limit ?? DEFAULT_LIMIT;
    const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    const prefix =
      options.keyPrefix ??
      `${context.getClass().name}:${context.getHandler().name}`;
    const key = `${prefix}:${ip}`;

    const result = this.rateLimitService.consume(key, limit, windowMs);

    if (!result.allowed) {
      const retrySeconds = Math.ceil(result.retryAfterMs / 1000);
      throw new HttpException(
        `Too many attempts. Try again in ${retrySeconds}s`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
