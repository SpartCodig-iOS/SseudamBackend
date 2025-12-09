import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import * as poolModule from '../db/pool';
import { TravelService } from '../modules/travel/travel.service';

const samplePayload = {
  title: '업데이트된 여행',
  startDate: '2024-09-01',
  endDate: '2024-09-10',
  countryCode: 'JP',
  countryNameKr: '일본',
  baseCurrency: 'JPY',
  baseExchangeRate: 111.11,
  countryCurrencies: ['JPY'],
};

test('listTravels returns mapped and paginated travel summaries', async () => {
  const responses = [
    { rows: [{ total: 2 }] },
    {
      rows: [
        {
          id: 'travel-1',
          title: '도쿄 가을 여행',
          start_date: '2024-08-01',
          end_date: '2024-08-05',
          country_code: 'JP',
          country_currencies: ['JPY'],
          base_currency: 'JPY',
          base_exchange_rate: 144.5,
          invite_code: 'abc123',
          status: 'active',
          created_at: '2024-07-01T00:00:00.000Z',
          owner_name: '홍길동',
          members: [
            {
              userId: 'user-1',
              name: '홍길동',
              role: 'owner',
            },
          ],
        },
      ],
    },
  ];

  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const queryMock = mock.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    const next = responses.shift();
    assert.ok(next, 'unexpected query execution');
    return { rows: next.rows };
  });

  const mockPool = { query: queryMock } as any;
  mock.method(poolModule, 'getPool', async () => mockPool);

  try {
    const mockMetaService = {
      getCountries: async () => [{ code: 'JP', currencies: ['JPY'] }],
    } as any;
    const mockCacheService = {
      get: async () => null,
      set: async () => undefined,
      del: async () => undefined,
      delPattern: async () => undefined,
      mget: async () => [],
      mset: async () => undefined,
    } as any;
    const mockEventEmitter = {
      emit: () => undefined,
    } as any;
    const mockPushNotificationService = {
      sendTravelNotification: async () => undefined,
      sendExpenseNotification: async () => undefined,
    } as any;

    const service = new TravelService(
      mockMetaService,
      mockCacheService,
      mockEventEmitter,
      mockPushNotificationService
    );
    const result = await service.listTravels('user-1', { page: 2, limit: 1 });

    assert.equal(result.total, 2);
    assert.equal(result.page, 2);
    assert.equal(result.limit, 1);
    assert.equal(result.items.length, 1);

    const [item] = result.items;
    assert.equal(item.id, 'travel-1');
    assert.equal(item.title, '도쿄 가을 여행');
    assert.equal(item.startDate, '2024-08-01');
    assert.equal(item.endDate, '2024-08-05');
    assert.equal(item.status, 'active');
    assert.equal(item.destinationCurrency, 'JPY');
    assert.ok(Array.isArray(item.members));
    assert.equal(item.members?.[0].name, '홍길동');
    assert.deepEqual(item.countryCurrencies, ['JPY']);

    const [, listCall] = calls;
    assert.deepEqual(listCall.params, ['user-1', 1, 1], 'limit and offset should be applied');
  } finally {
    mock.restoreAll();
  }
});

test('updateTravel applies owner changes and returns refreshed summary', async () => {
  const updateArgs: unknown[] = [];

  const queryMock = mock.fn(async (sql: string, params?: unknown[]) => {
    if (sql.startsWith('BEGIN') || sql.startsWith('COMMIT') || sql.startsWith('ROLLBACK')) {
      return { rows: [] };
    }
    if (sql.includes('SELECT 1 FROM travels WHERE id = $1 AND owner_id = $2 LIMIT 1 FOR UPDATE')) {
      return { rows: [{ exists: true }] };
    }
    if (sql.startsWith('INSERT INTO travel_currency_snapshots')) {
      return { rows: [] };
    }
    if (sql.startsWith('UPDATE travels')) {
      updateArgs.push(...(params ?? []));
      return {
        rows: [
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
        ],
      };
    }

    if (sql.includes('FROM travels t') && sql.includes('travel_members tm')) {
      return {
        rows: [
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
            owner_name: '호스트',
            members: [
              {
                userId: 'user-123',
                name: '호스트',
                role: 'owner',
              },
            ],
          },
        ],
      };
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const mockPool = { query: queryMock } as any;
  const client = { query: queryMock, release: mock.fn(() => {}) };
  const connectMock = mock.fn(async () => client);
  mockPool.connect = connectMock;
  mock.method(poolModule, 'getPool', async () => mockPool);

  try {
    const mockMetaService = {
      getCountries: async () => [{ code: 'JP', currencies: ['JPY'] }],
    } as any;
    const mockCacheService = {
      get: async () => null,
      set: async () => undefined,
      del: async () => undefined,
      delPattern: async () => undefined,
    } as any;
    const mockEventEmitter = {
      emit: () => undefined,
    } as any;
    const mockPushNotificationService = {
      sendTravelNotification: async () => undefined,
      sendExpenseNotification: async () => undefined,
    } as any;

    const service = new TravelService(
      mockMetaService,
      mockCacheService,
      mockEventEmitter,
      mockPushNotificationService
    );
    const result = await service.updateTravel('travel-123', 'user-123', samplePayload);

    assert.equal(updateArgs[0], 'travel-123');
    assert.equal(updateArgs[1], 'user-123');
    assert.equal(result.title, samplePayload.title);
    assert.equal(result.startDate, samplePayload.startDate);
    assert.equal(result.baseExchangeRate, samplePayload.baseExchangeRate);
    assert.equal(result.destinationCurrency, 'JPY');
    assert.equal(result.ownerName, '호스트');
    assert.equal(result.members?.[0].userId, 'user-123');
    assert.deepEqual(result.countryCurrencies, ['JPY']);
    assert.equal(connectMock.mock.callCount(), 1, 'pool.connect should be called');
    assert.equal(client.release.mock.callCount(), 1, 'client should be released');
  } finally {
    mock.restoreAll();
  }
});

test('deleteTravel verifies ownership and clears related records in a transaction', async () => {
  const clientQueries: string[] = [];
  const clientParams: unknown[][] = [];

  const client = {
    query: mock.fn(async (sql: string, params?: unknown[]) => {
      clientQueries.push(sql.trim());
      clientParams.push(params ?? []);
      return { rows: [] };
    }),
    release: mock.fn(() => {}),
  };

  const poolQuery = mock.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('SELECT owner_id FROM travels')) {
      return { rows: [{ owner_id: 'owner-999' }] };
    }
    throw new Error(`Unexpected pool query: ${sql} ${params}`);
  });

  const mockPool = {
    query: poolQuery,
    connect: mock.fn(async () => client),
  } as any;
  mock.method(poolModule, 'getPool', async () => mockPool);

  try {
    const mockMetaService = {
      getCountries: async () => [{ code: 'JP', currencies: ['JPY'] }],
    } as any;
    const mockCacheService = {
      delPattern: async () => undefined,
      del: async () => undefined,
    } as any;
    const mockEventEmitter = {
      emit: () => undefined,
    } as any;
    const mockPushNotificationService = {
      sendTravelNotification: async () => undefined,
      sendExpenseNotification: async () => undefined,
    } as any;

    const service = new TravelService(
      mockMetaService,
      mockCacheService,
      mockEventEmitter,
      mockPushNotificationService
    );
    await service.deleteTravel('travel-abc', 'owner-999');

    assert.equal(poolQuery.mock.callCount(), 1, 'ownership should be checked once');
    assert.equal(mockPool.connect.mock.callCount(), 1, 'transaction client should be acquired');
    assert.equal(client.query.mock.callCount(), 8, 'BEGIN + 6 deletes + COMMIT');
    assert.ok(clientQueries[0].startsWith('BEGIN'));
    assert.ok(clientQueries.includes('DELETE FROM travels WHERE id = $1'));
    clientParams.forEach((params) => {
      if (params.length) {
        assert.equal(params[0], 'travel-abc');
      }
    });
    assert.equal(client.release.mock.callCount(), 1, 'client should be released after transaction');
  } finally {
    mock.restoreAll();
  }
});
