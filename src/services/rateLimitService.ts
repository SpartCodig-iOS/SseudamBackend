import { Injectable } from '@nestjs/common';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
}

@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
  private lastCleanup = 0;

  consume(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    this.cleanup(now);

    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, bucket);
    }

    if (bucket.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: bucket.resetAt,
        retryAfterMs: Math.max(bucket.resetAt - now, 0),
      };
    }

    bucket.count += 1;

    return {
      allowed: true,
      remaining: Math.max(limit - bucket.count, 0),
      resetAt: bucket.resetAt,
      retryAfterMs: 0,
    };
  }

  /**
   * Gateway에서 사용하는 Rate Limit 체크 (checkLimit 메서드 추가)
   */
  async checkLimit(key: string, maxRequests: number, windowMs: number): Promise<{ allowed: boolean; remaining: number }> {
    const result = this.consume(key, maxRequests, windowMs);
    return {
      allowed: result.allowed,
      remaining: result.remaining,
    };
  }

  private cleanup(now: number) {
    if (now - this.lastCleanup < this.CLEANUP_INTERVAL_MS) {
      return;
    }

    this.lastCleanup = now;
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
