import test from 'node:test';
import assert from 'node:assert/strict';
import { RateLimitService } from '../services/rateLimitService';

test('RateLimitService allows requests within the limit', () => {
  const service = new RateLimitService();
  const key = 'rate-limit:test';
  const windowMs = 1000;
  const result1 = service.consume(key, 2, windowMs);
  const result2 = service.consume(key, 2, windowMs);

  assert.ok(result1.allowed);
  assert.ok(result2.allowed);
  assert.equal(result2.remaining, 0);
});

test('RateLimitService blocks requests over the limit', () => {
  const service = new RateLimitService();
  const key = 'rate-limit:block';
  const windowMs = 1000;

  service.consume(key, 1, windowMs);
  const result = service.consume(key, 1, windowMs);

  assert.equal(result.allowed, false);
  assert.ok(result.retryAfterMs > 0);
});

test('RateLimitService resets counts after the window', async () => {
  const service = new RateLimitService();
  const key = 'rate-limit:reset';
  const windowMs = 50;

  service.consume(key, 1, windowMs);
  const blocked = service.consume(key, 1, windowMs);
  assert.equal(blocked.allowed, false);

  await new Promise((resolve) => setTimeout(resolve, windowMs + 10));

  const afterWindow = service.consume(key, 1, windowMs);
  assert.equal(afterWindow.allowed, true);
});
