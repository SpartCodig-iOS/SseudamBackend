import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { TravelService } from '../modules/travel/travel.service';

// ────────────────────────────────────────────────────────────
// 공통 Mock 헬퍼
// ────────────────────────────────────────────────────────────

const samplePayload = {
  title: '업데이트된 여행',
  startDate: '2024-09-01',
  endDate: '2024-09-10',
  countryCode: 'JP',
  countryNameKr: '일본',
  baseCurrency: 'JPY',
  baseExchangeRate: 111.11,
  countryCurrencies: ['JPY'],
  budget: undefined,
  budgetCurrency: undefined,
};

function buildMockAdaptiveCacheService() {
  return {
    get: async (_key: string, fetcher: () => Promise<unknown>) => fetcher(),
    del: async () => undefined,
    invalidateByTag: async () => undefined,
    invalidateByTags: async () => undefined,
    getStats: () => ({
      hits: 0, misses: 0, evictions: 0,
      ttlAdjustments: 0, hitRate: 0, memory: {},
    }),
    getExchangeRate: async (_key: string, fetcher: () => Promise<unknown>) => fetcher(),
    getTravelList: async (_uid: string, _p: number, _l: number, fetcher: () => Promise<unknown>) => fetcher(),
    getTravelDetail: async (_id: string, fetcher: () => Promise<unknown>) => fetcher(),
  } as any;
}

function buildMockCacheService() {
  return {
    get: async () => null,
    set: async () => undefined,
    del: async () => undefined,
    delPattern: async () => undefined,
    mget: async () => [],
    mset: async () => undefined,
  } as any;
}

function buildMockMetricsService() {
  return {
    recordTravelCreated: () => undefined,
    recordSettlementCalculated: () => undefined,
    recordLoginAttempt: () => undefined,
    recordExpenseAdded: () => undefined,
    updateCacheHitRatio: () => undefined,
    recordHttpRequest: () => undefined,
  } as any;
}

function buildCommonMocks() {
  return {
    metaService: {
      getCountries: async () => [{ code: 'JP', currencies: ['JPY'] }],
    } as any,
    cacheService: buildMockCacheService(),
    adaptiveCacheService: buildMockAdaptiveCacheService(),
    eventEmitter: { emit: () => undefined } as any,
    pushNotificationService: {
      sendTravelNotification: async () => undefined,
      sendExpenseNotification: async () => undefined,
    } as any,
    profileService: {
      fetchAvatarWithTimeout: async () => null,
      warmAvatarFromStorage: async () => undefined,
    } as any,
    queueEventService: {
      emitTravelCreated: async () => undefined,
      emitMemberInvited: async () => undefined,
      emitExpenseAdded: async () => undefined,
    } as any,
    metricsService: buildMockMetricsService(),
  };
}

// ────────────────────────────────────────────────────────────
// listTravels 테스트
// ────────────────────────────────────────────────────────────

test('listTravels returns mapped and paginated travel summaries', async () => {
  /**
   * 현재 listTravels 구현:
   *   1. dataSource.query(여행목록 JOIN - total_count 포함)
   *   2. dataSource.query(멤버 목록) - mget 캐시 미스 시
   *
   * listRows[0].total_count 에서 total을 가져옴
   */
  const listRows = [
    {
      id: 'travel-1',
      title: '도쿄 가을 여행',
      start_date: '2024-08-01',
      end_date: '2024-08-05',
      country_code: 'JP',
      country_name_kr: '일본',
      country_currencies: ['JPY'],
      base_currency: 'JPY',
      base_exchange_rate: 144.5,
      budget: null,
      budget_currency: null,
      invite_code: 'abc123',
      status: 'active',
      role: 'owner',
      created_at: '2024-07-01T00:00:00.000Z',
      owner_name: '홍길동',
      total_count: '2',
    },
  ];

  const memberRows = [
    {
      travel_id: 'travel-1',
      user_id: 'user-1',
      role: 'owner',
      name: '홍길동',
      email: null,
      avatar_url: null,
    },
  ];

  let queryCallCount = 0;
  const queryMock = mock.fn(async (sql: string) => {
    queryCallCount++;
    // 첫 번째: 여행 목록 쿼리
    if (sql.includes('travel_members tm') && sql.includes('total_count')) {
      return listRows;
    }
    // 두 번째: 멤버 목록 쿼리
    if (sql.includes('FROM travel_members tm') && sql.includes('LEFT JOIN profiles p')) {
      return memberRows;
    }
    // 국가 통화 쿼리 등 기타
    return [];
  });

  const mocks = buildCommonMocks();
  // ensureCountryCurrencyMap이 dataSource.query를 사용할 수 있음
  const mockDataSource = { query: queryMock } as any;

  const service = new TravelService(
    mockDataSource,
    mocks.metaService,
    mocks.cacheService,
    mocks.adaptiveCacheService,
    mocks.eventEmitter,
    mocks.pushNotificationService,
    mocks.profileService,
    mocks.queueEventService,
    mocks.metricsService,
  );

  const result = await service.listTravels('user-1', { page: 1, limit: 10 });

  assert.equal(result.total, 2);
  assert.equal(result.page, 1);
  assert.equal(result.limit, 10);
  assert.equal(result.items.length, 1);

  const [item] = result.items;
  assert.equal(item.id, 'travel-1');
  assert.equal(item.title, '도쿄 가을 여행');
  assert.equal(item.startDate, '2024-08-01');
  assert.equal(item.endDate, '2024-08-05');
  assert.equal(item.status, 'active');
  assert.ok(Array.isArray(item.countryCurrencies));
  assert.deepEqual(item.countryCurrencies, ['JPY']);
});

// ────────────────────────────────────────────────────────────
// updateTravel 테스트
// ────────────────────────────────────────────────────────────

test('updateTravel applies owner changes and returns refreshed summary', async () => {
  /**
   * updateTravel 흐름:
   *   1. ensureTransaction -> manager.query (SELECT FOR UPDATE 소유권 확인)
   *   2. manager.query (INSERT travel_currency_snapshots)
   *   3. manager.query (UPDATE travels)
   *   4. dataSource.query (fetchSummaryForMember - 상세 조회)
   *   5. dataSource.query (멤버 목록)
   */
  const updateArgs: unknown[] = [];

  const queryMock = mock.fn(async (sql: string, params?: unknown[]) => {
    // 소유권 확인 (FOR UPDATE)
    if (sql.includes('FOR UPDATE')) {
      return [{ exists: true }];
    }
    // currency snapshot 삽입
    if (sql.startsWith('INSERT INTO travel_currency_snapshots')) {
      return [];
    }
    // 여행 업데이트
    if (sql.startsWith('UPDATE travels')) {
      updateArgs.push(...(params ?? []));
      return [
        {
          id: 'travel-123',
          title: samplePayload.title,
          start_date: samplePayload.startDate,
          end_date: samplePayload.endDate,
          country_code: samplePayload.countryCode,
          base_currency: samplePayload.baseCurrency,
          base_exchange_rate: samplePayload.baseExchangeRate,
          country_currencies: [samplePayload.baseCurrency],
          invite_code: 'invite-123',
          status: 'active',
          created_at: '2024-06-01T00:00:00.000Z',
        },
      ];
    }
    // 여행 상세 조회 (fetchSummaryForMember)
    if (sql.includes('FROM travels t') && sql.includes('LEFT JOIN travel_invites')) {
      return [
        {
          id: 'travel-123',
          title: samplePayload.title,
          start_date: samplePayload.startDate,
          end_date: samplePayload.endDate,
          country_code: samplePayload.countryCode,
          country_name_kr: '일본',
          base_currency: samplePayload.baseCurrency,
          base_exchange_rate: samplePayload.baseExchangeRate,
          country_currencies: [samplePayload.baseCurrency],
          budget: null,
          budget_currency: null,
          invite_code: 'invite-123',
          status: 'active',
          created_at: '2024-06-01T00:00:00.000Z',
          owner_name: '호스트',
        },
      ];
    }
    // 멤버 목록 조회
    if (sql.includes('FROM travel_members tm') && sql.includes('LEFT JOIN profiles p')) {
      return [
        {
          travel_id: 'travel-123',
          user_id: 'user-123',
          role: 'owner',
          name: '호스트',
          email: null,
          avatar_url: null,
        },
      ];
    }
    // 기타 쿼리 (캐시 무효화 관련 등)
    return [];
  });

  const mocks = buildCommonMocks();
  const mockDataSource = {
    transaction: async (cb: (manager: any) => Promise<any>) => {
      const manager = { query: queryMock };
      return cb(manager);
    },
    query: queryMock,
  } as any;

  const service = new TravelService(
    mockDataSource,
    mocks.metaService,
    mocks.cacheService,
    mocks.adaptiveCacheService,
    mocks.eventEmitter,
    mocks.pushNotificationService,
    mocks.profileService,
    mocks.queueEventService,
    mocks.metricsService,
  );

  const result = await service.updateTravel('travel-123', 'user-123', samplePayload);

  assert.equal(result.title, samplePayload.title);
  assert.equal(result.startDate, samplePayload.startDate);
  assert.equal(result.baseExchangeRate, samplePayload.baseExchangeRate);
  assert.equal(result.ownerName, '호스트');
  assert.ok(Array.isArray(result.members));
  assert.equal(result.members?.[0].userId, 'user-123');
  assert.deepEqual(result.countryCurrencies, ['JPY']);
});

// ────────────────────────────────────────────────────────────
// deleteTravel 테스트
// ────────────────────────────────────────────────────────────

test('deleteTravel verifies ownership and removes all related records', async () => {
  /**
   * deleteTravel 흐름:
   *   1. ensureOwner -> dataSource.query (SELECT owner_id FROM travels)
   *   2. dataSource.query (SELECT user_id FROM travel_members)
   *   3. ensureTransaction -> manager.query (WITH CTE: 모든 레코드 삭제)
   */
  const queriedSqls: string[] = [];

  const queryMock = mock.fn(async (sql: string) => {
    queriedSqls.push(sql.trim());
    // 소유권 확인
    if (sql.includes('SELECT owner_id FROM travels')) {
      return [{ owner_id: 'owner-999' }];
    }
    // 멤버 목록 조회 (캐시 무효화용)
    if (sql.includes('SELECT user_id FROM travel_members')) {
      return [{ user_id: 'owner-999' }];
    }
    // WITH CTE 삭제
    if (sql.includes('DELETE FROM travels WHERE id = $1')) {
      return [];
    }
    return [];
  });

  const mocks = buildCommonMocks();
  const mockDataSource = {
    transaction: async (cb: (manager: any) => Promise<any>) => {
      const manager = { query: queryMock };
      return cb(manager);
    },
    query: queryMock,
  } as any;

  const service = new TravelService(
    mockDataSource,
    mocks.metaService,
    mocks.cacheService,
    mocks.adaptiveCacheService,
    mocks.eventEmitter,
    mocks.pushNotificationService,
    mocks.profileService,
    mocks.queueEventService,
    mocks.metricsService,
  );

  // 예외 없이 정상 완료되어야 한다
  await assert.doesNotReject(
    () => service.deleteTravel('travel-abc', 'owner-999'),
    'deleteTravel should complete without throwing',
  );

  // 소유권 확인 쿼리가 실행되었어야 한다
  assert.ok(
    queriedSqls.some((sql) => sql.includes('SELECT owner_id FROM travels')),
    'ownership check should be performed',
  );

  // 삭제 쿼리가 실행되었어야 한다
  assert.ok(
    queriedSqls.some((sql) => sql.includes('DELETE FROM travels WHERE id = $1')),
    'delete query should be executed',
  );
});
