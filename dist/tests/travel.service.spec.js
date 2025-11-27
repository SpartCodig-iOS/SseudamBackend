"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importStar(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const poolModule = __importStar(require("../db/pool"));
const travel_service_1 = require("../modules/travel/travel.service");
const samplePayload = {
    title: '업데이트된 여행',
    startDate: '2024-09-01',
    endDate: '2024-09-10',
    countryCode: 'JP',
    baseCurrency: 'JPY',
    baseExchangeRate: 111.11,
};
(0, node_test_1.default)('listTravels returns mapped and paginated travel summaries', async () => {
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
    const calls = [];
    const queryMock = node_test_1.mock.fn(async (sql, params) => {
        calls.push({ sql, params });
        const next = responses.shift();
        strict_1.default.ok(next, 'unexpected query execution');
        return { rows: next.rows };
    });
    const mockPool = { query: queryMock };
    node_test_1.mock.method(poolModule, 'getPool', async () => mockPool);
    try {
        const service = new travel_service_1.TravelService({
            getCountries: async () => [{ code: 'JP', currencies: ['JPY'] }],
        });
        const result = await service.listTravels('user-1', { page: 2, limit: 1 });
        strict_1.default.equal(result.total, 2);
        strict_1.default.equal(result.page, 2);
        strict_1.default.equal(result.limit, 1);
        strict_1.default.equal(result.items.length, 1);
        const [item] = result.items;
        strict_1.default.equal(item.id, 'travel-1');
        strict_1.default.equal(item.title, '도쿄 가을 여행');
        strict_1.default.equal(item.startDate, '2024-08-01');
        strict_1.default.equal(item.endDate, '2024-08-05');
        strict_1.default.equal(item.status, 'active');
        strict_1.default.equal(item.destinationCurrency, 'JPY');
        strict_1.default.ok(Array.isArray(item.members));
        strict_1.default.equal(item.members?.[0].name, '홍길동');
        const [, listCall] = calls;
        strict_1.default.deepEqual(listCall.params, ['user-1', 1, 1], 'limit and offset should be applied');
    }
    finally {
        node_test_1.mock.restoreAll();
    }
});
(0, node_test_1.default)('updateTravel applies owner changes and returns refreshed summary', async () => {
    const updateArgs = [];
    const queryMock = node_test_1.mock.fn(async (sql, params) => {
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
    const mockPool = { query: queryMock };
    node_test_1.mock.method(poolModule, 'getPool', async () => mockPool);
    try {
        const service = new travel_service_1.TravelService({
            getCountries: async () => [{ code: 'JP', currencies: ['JPY'] }],
        });
        const result = await service.updateTravel('travel-123', 'user-123', samplePayload);
        strict_1.default.equal(updateArgs[0], 'travel-123');
        strict_1.default.equal(updateArgs[1], 'user-123');
        strict_1.default.equal(result.title, samplePayload.title);
        strict_1.default.equal(result.startDate, samplePayload.startDate);
        strict_1.default.equal(result.baseExchangeRate, samplePayload.baseExchangeRate);
        strict_1.default.equal(result.destinationCurrency, 'JPY');
        strict_1.default.equal(result.ownerName, '호스트');
        strict_1.default.equal(result.members?.[0].userId, 'user-123');
    }
    finally {
        node_test_1.mock.restoreAll();
    }
});
(0, node_test_1.default)('deleteTravel verifies ownership and clears related records in a transaction', async () => {
    const clientQueries = [];
    const clientParams = [];
    const client = {
        query: node_test_1.mock.fn(async (sql, params) => {
            clientQueries.push(sql.trim());
            clientParams.push(params ?? []);
            return { rows: [] };
        }),
        release: node_test_1.mock.fn(() => { }),
    };
    const poolQuery = node_test_1.mock.fn(async (sql, params) => {
        if (sql.includes('SELECT owner_id FROM travels')) {
            return { rows: [{ owner_id: 'owner-999' }] };
        }
        throw new Error(`Unexpected pool query: ${sql} ${params}`);
    });
    const mockPool = {
        query: poolQuery,
        connect: node_test_1.mock.fn(async () => client),
    };
    node_test_1.mock.method(poolModule, 'getPool', async () => mockPool);
    try {
        const service = new travel_service_1.TravelService({
            getCountries: async () => [{ code: 'JP', currencies: ['JPY'] }],
        });
        await service.deleteTravel('travel-abc', 'owner-999');
        strict_1.default.equal(poolQuery.mock.callCount(), 1, 'ownership should be checked once');
        strict_1.default.equal(mockPool.connect.mock.callCount(), 1, 'transaction client should be acquired');
        strict_1.default.equal(client.query.mock.callCount(), 8, 'BEGIN + 6 deletes + COMMIT');
        strict_1.default.ok(clientQueries[0].startsWith('BEGIN'));
        strict_1.default.ok(clientQueries.includes('DELETE FROM travels WHERE id = $1'));
        clientParams.forEach((params) => {
            if (params.length) {
                strict_1.default.equal(params[0], 'travel-abc');
            }
        });
        strict_1.default.equal(client.release.mock.callCount(), 1, 'client should be released after transaction');
    }
    finally {
        node_test_1.mock.restoreAll();
    }
});
