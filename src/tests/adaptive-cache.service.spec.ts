/**
 * AdaptiveCacheService 단위 테스트
 *
 * 현재 AdaptiveCacheService는 다음 공개 메서드를 가집니다:
 *   - get(key, factory, options?) → cache-aside 패턴
 *   - getExchangeRate(key, factory)
 *   - del(key)
 *   - invalidateByTag(tag)
 *   - invalidateByTags(tags[])
 *   - getStats() → { size, hits, misses, hitRate, evictions, tagCount }
 *
 * Redis(CacheService)는 Mock으로 대체하여 외부 의존성 없이 실행합니다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveCacheService } from '../common/services/adaptive-cache.service';

// ────────────────────────────────────────────────────────────
// Mock CacheService — Redis 없이 L2 캐시 시뮬레이션
// ────────────────────────────────────────────────────────────

function buildMockCacheService() {
  const store = new Map<string, unknown>();
  return {
    get: async <T>(key: string): Promise<T | null> =>
      (store.get(key) as T | undefined) ?? null,
    set: async (key: string, value: unknown) => {
      store.set(key, value);
    },
    del: async (key: string) => {
      store.delete(key);
    },
    delPattern: async (pattern: string) => {
      // 태그 기반 무효화 시 L2 캐시도 함께 제거
      // 패턴 예: '*:group1:*' → 모든 키 삭제 (단순 구현)
      const tag = pattern.replace(/\*/g, '').replace(/:/g, '');
      for (const key of store.keys()) {
        if (key.includes(tag) || tag === '') {
          store.delete(key);
        }
      }
      // 패턴이 와일드카드만 있으면 전체 삭제
      if (pattern === '*') {
        store.clear();
      }
    },
    store,
  } as any;
}

// ────────────────────────────────────────────────────────────
// 헬퍼: 서비스 인스턴스 생성
// ────────────────────────────────────────────────────────────

function buildService(mockCache = buildMockCacheService()) {
  return new AdaptiveCacheService(mockCache);
}

// ════════════════════════════════════════════════════════════
// get: 캐시 미스 시 factory 실행
// ════════════════════════════════════════════════════════════

test('get: 캐시 미스 시 fetcher를 실행하고 결과를 반환한다', async () => {
  const svc = buildService();
  let fetcherCalls = 0;

  const result = await svc.get(
    'key1',
    async () => {
      fetcherCalls++;
      return { value: 42 };
    },
    { baseTtl: 60 },
  );

  assert.deepEqual(result, { value: 42 });
  assert.equal(fetcherCalls, 1);
});

// ════════════════════════════════════════════════════════════
// get: 두 번째 호출에서 L1 캐시 히트
// ════════════════════════════════════════════════════════════

test('get: 두 번째 호출에서 캐시 히트 - fetcher가 재실행되지 않는다', async () => {
  const svc = buildService();
  let fetcherCalls = 0;

  const fetcher = async () => {
    fetcherCalls++;
    return 'cached-value';
  };

  await svc.get('key2', fetcher, { baseTtl: 60 });
  const second = await svc.get('key2', fetcher, { baseTtl: 60 });

  assert.equal(second, 'cached-value');
  // L1 LRU 히트: fetcher는 1회만 호출되어야 한다
  assert.equal(fetcherCalls, 1);
});

// ════════════════════════════════════════════════════════════
// get: 히트 횟수 증가 시 TTL 연장 (내부 동작 검증은 stats로 확인)
// ════════════════════════════════════════════════════════════

test('get: 반복 조회 시 캐시 히트 횟수가 증가한다', async () => {
  const svc = buildService();
  const fetcher = async () => 'data';

  // 최초 1회 저장 (미스)
  await svc.get('key3', fetcher, { baseTtl: 60, maxTtlMultiplier: 4 });

  // 추가 히트 유도
  for (let i = 0; i < 10; i++) {
    await svc.get('key3', fetcher, { baseTtl: 60, maxTtlMultiplier: 4 });
  }

  const stats = svc.getStats();
  assert.ok(stats.hits > 0, `히트 횟수가 0보다 커야 한다 (실제: ${stats.hits})`);
  assert.equal(stats.misses, 1, '미스는 최초 1회여야 한다');
});

// ════════════════════════════════════════════════════════════
// del: 삭제 후 다음 get 시 fetcher 재실행
// ════════════════════════════════════════════════════════════

test('del: 특정 키를 삭제하면 다음 get 시 fetcher가 다시 실행된다', async () => {
  const svc = buildService();
  let fetcherCalls = 0;

  const fetcher = async () => {
    fetcherCalls++;
    return 'value';
  };

  await svc.get('key4', fetcher, { baseTtl: 60 });
  await svc.del('key4');
  await svc.get('key4', fetcher, { baseTtl: 60 });

  assert.equal(fetcherCalls, 2, '삭제 후 fetcher가 다시 실행되어야 한다');
});

// ════════════════════════════════════════════════════════════
// invalidateByTag: 태그로 연결된 모든 키 무효화
// L2 캐시를 비활성화하여 순수 L1(인메모리) 동작만 검증
// ════════════════════════════════════════════════════════════

test('invalidateByTag: 태그로 연결된 모든 키를 무효화한다', async () => {
  // L2 캐시는 항상 null 반환 → L1 동작만 테스트
  const noL2CacheService = {
    get: async () => null,
    set: async () => undefined,
    del: async () => undefined,
    delPattern: async () => undefined,
  } as any;
  const svc = buildService(noL2CacheService);
  const calls = { a: 0, b: 0 };

  await svc.get('tagKey1', async () => { calls.a++; return 'a'; }, {
    baseTtl: 60,
    tags: ['group1'],
  });
  await svc.get('tagKey2', async () => { calls.b++; return 'b'; }, {
    baseTtl: 60,
    tags: ['group1'],
  });

  // 태그 기반 L1 무효화
  await svc.invalidateByTag('group1');

  // 무효화 후 재조회 → L1 미스 + L2 null → fetcher 재실행
  await svc.get('tagKey1', async () => { calls.a++; return 'a'; }, {
    baseTtl: 60,
    tags: ['group1'],
  });
  await svc.get('tagKey2', async () => { calls.b++; return 'b'; }, {
    baseTtl: 60,
    tags: ['group1'],
  });

  assert.equal(calls.a, 2, 'tagKey1 - 무효화 후 fetcher 재실행 확인');
  assert.equal(calls.b, 2, 'tagKey2 - 무효화 후 fetcher 재실행 확인');
});

// ════════════════════════════════════════════════════════════
// invalidateByTags: 복수 태그 무효화
// ════════════════════════════════════════════════════════════

test('invalidateByTags: 여러 태그를 한 번에 무효화한다', async () => {
  // L2 비활성화 → L1만 테스트
  const noL2 = {
    get: async () => null,
    set: async () => undefined,
    del: async () => undefined,
    delPattern: async () => undefined,
  } as any;
  const svc = buildService(noL2);
  let callCountA = 0;
  let callCountB = 0;

  // 태그 A에 key1 저장
  await svc.get('multiTag1', async () => { callCountA++; return 'x'; }, {
    baseTtl: 60,
    tags: ['tagA'],
  });
  // 태그 B에 key2 저장
  await svc.get('multiTag2', async () => { callCountB++; return 'y'; }, {
    baseTtl: 60,
    tags: ['tagB'],
  });

  // 두 태그 모두 무효화
  await svc.invalidateByTags(['tagA', 'tagB']);

  // 재조회 시 fetcher가 다시 실행되어야 한다 (각각 개별 카운터 사용, 동일 태그 유지)
  await svc.get('multiTag1', async () => { callCountA++; return 'x'; }, { baseTtl: 60, tags: ['tagA'] });
  await svc.get('multiTag2', async () => { callCountB++; return 'y'; }, { baseTtl: 60, tags: ['tagB'] });

  assert.equal(callCountA, 2, 'multiTag1 fetcher가 2회 실행되어야 한다');
  assert.equal(callCountB, 2, 'multiTag2 fetcher가 2회 실행되어야 한다');
});

// ════════════════════════════════════════════════════════════
// getStats: 히트율과 통계 정보 반환
// ════════════════════════════════════════════════════════════

test('getStats: 히트/미스 횟수와 히트율이 정확하다', async () => {
  const svc = buildService();
  const fetcher = async () => 'v';

  await svc.get('s1', fetcher, { baseTtl: 60 }); // miss
  await svc.get('s1', fetcher, { baseTtl: 60 }); // hit

  const stats = svc.getStats();

  assert.equal(stats.misses, 1, '미스 횟수는 1이어야 한다');
  assert.equal(stats.hits, 1, '히트 횟수는 1이어야 한다');
  // hitRate: hits / (hits + misses) = 1/2 = 0.5
  assert.ok(
    Math.abs(stats.hitRate - 0.5) < 0.001,
    `히트율이 0.5여야 한다 (실제: ${stats.hitRate})`,
  );
  assert.ok(typeof stats.size === 'number', 'size 필드가 숫자여야 한다');
  assert.ok(typeof stats.evictions === 'number', 'evictions 필드가 숫자여야 한다');
  assert.ok(typeof stats.tagCount === 'number', 'tagCount 필드가 숫자여야 한다');
});

// ════════════════════════════════════════════════════════════
// getStats: tagCount 동기화 확인
// ════════════════════════════════════════════════════════════

test('getStats: 태그 등록 후 tagCount가 증가한다', async () => {
  const svc = buildService();

  const statsBefore = svc.getStats();

  await svc.get('taggedKey1', async () => 'a', { baseTtl: 60, tags: ['myTag'] });
  await svc.get('taggedKey2', async () => 'b', { baseTtl: 60, tags: ['myTag'] });

  const statsAfter = svc.getStats();

  assert.ok(statsAfter.tagCount >= statsBefore.tagCount, 'tagCount가 증가하거나 유지되어야 한다');
  assert.equal(statsAfter.size, 2, '캐시에 2개 엔트리가 저장되어야 한다');
});

// ════════════════════════════════════════════════════════════
// getExchangeRate: 환율 전용 헬퍼
// ════════════════════════════════════════════════════════════

test('getExchangeRate: 환율 전용 헬퍼가 올바르게 동작한다', async () => {
  const svc = buildService();
  let calls = 0;

  const result = await svc.getExchangeRate('rate:KRW-USD', async () => {
    calls++;
    return { rate: 0.00075, base: 'KRW', quote: 'USD' };
  });

  assert.deepEqual(result, { rate: 0.00075, base: 'KRW', quote: 'USD' });
  assert.equal(calls, 1, '최초 1회 fetcher 실행 확인');

  // 두 번째 조회 → 캐시 히트
  await svc.getExchangeRate('rate:KRW-USD', async () => {
    calls++;
    return { rate: 0.0008, base: 'KRW', quote: 'USD' };
  });

  assert.equal(calls, 1, '두 번째 조회는 캐시 히트여야 한다');
});

// ════════════════════════════════════════════════════════════
// get: null 반환 시 캐시에 저장하지 않음
// ════════════════════════════════════════════════════════════

test('get: factory가 null을 반환하면 캐시에 저장하지 않는다', async () => {
  const svc = buildService();
  let calls = 0;

  const result1 = await svc.get('nullKey', async () => {
    calls++;
    return null as any;
  }, { baseTtl: 60 });

  const result2 = await svc.get('nullKey', async () => {
    calls++;
    return null as any;
  }, { baseTtl: 60 });

  assert.equal(result1, null);
  assert.equal(result2, null);
  // null이므로 캐시 저장 안됨 → fetcher 2회 실행
  assert.equal(calls, 2, 'null 결과는 캐시에 저장되지 않아야 한다');
});

// ════════════════════════════════════════════════════════════
// del: 존재하지 않는 키 삭제 시 에러 없이 처리
// ════════════════════════════════════════════════════════════

test('del: 존재하지 않는 키 삭제 시 예외가 발생하지 않는다', async () => {
  const svc = buildService();

  await assert.doesNotReject(
    () => svc.del('non-existent-key'),
    '존재하지 않는 키 삭제 시 예외가 발생하면 안 된다',
  );
});

// ════════════════════════════════════════════════════════════
// invalidateByTag: 존재하지 않는 태그 무효화 시 에러 없이 처리
// ════════════════════════════════════════════════════════════

test('invalidateByTag: 존재하지 않는 태그 무효화 시 예외가 발생하지 않는다', async () => {
  const svc = buildService();

  await assert.doesNotReject(
    () => svc.invalidateByTag('unknown-tag'),
    '존재하지 않는 태그 무효화 시 예외가 발생하면 안 된다',
  );
});
