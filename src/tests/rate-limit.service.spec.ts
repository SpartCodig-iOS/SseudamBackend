import test from 'node:test';
import assert from 'node:assert/strict';
import { RateLimitService } from '../common/services/rate-limit.service';

// CacheService Mock: Redis 없이 fallback 동작 테스트
const mockCacheService = {
  getRedisClient: async () => null,
} as any;

test('RateLimitService allows requests within the limit', async () => {
  const service = new RateLimitService(mockCacheService);
  const key = 'rate-limit:test';
  const windowMs = 1000;
  const result1 = await service.consume(key, 2, windowMs);
  const result2 = await service.consume(key, 2, windowMs);

  assert.ok(result1.allowed);
  assert.ok(result2.allowed);
  assert.equal(result2.remaining, 0);
});

test('RateLimitService blocks requests over the limit', async () => {
  const service = new RateLimitService(mockCacheService);
  const key = 'rate-limit:block';
  const windowMs = 1000;

  await service.consume(key, 1, windowMs);
  const result = await service.consume(key, 1, windowMs);

  assert.equal(result.allowed, false);
  assert.ok(result.retryAfterMs > 0);
});

test('RateLimitService resets counts after the window', async () => {
  const service = new RateLimitService(mockCacheService);
  const key = 'rate-limit:reset';
  const windowMs = 50;

  await service.consume(key, 1, windowMs);
  const blocked = await service.consume(key, 1, windowMs);
  assert.equal(blocked.allowed, false);

  await new Promise((resolve) => setTimeout(resolve, windowMs + 10));

  const afterWindow = await service.consume(key, 1, windowMs);
  assert.equal(afterWindow.allowed, true);
});
