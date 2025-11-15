"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testConnection = exports.getPoolStats = exports.getPool = void 0;
const pg_1 = require("pg");
const env_1 = require("../config/env");
const network_1 = require("../utils/network");
let pool = null;
const parseDatabaseUrl = (url) => {
    const parsed = new URL(url);
    return {
        host: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : 5432,
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        database: parsed.pathname.replace(/^\//, ''),
    };
};
const manualDatabaseConfig = () => {
    if (!env_1.env.databaseHost || !env_1.env.databaseUser || !env_1.env.databaseName) {
        throw new Error('DATABASE_* variables are incomplete. Provide DATABASE_URL or host/user/name.');
    }
    return {
        host: env_1.env.databaseHost,
        port: env_1.env.databasePort ?? 5432,
        user: env_1.env.databaseUser,
        password: env_1.env.databasePassword ?? undefined,
        database: env_1.env.databaseName,
    };
};
const buildPoolConfig = async () => {
    const base = env_1.env.databaseUrl ? parseDatabaseUrl(env_1.env.databaseUrl) : manualDatabaseConfig();
    const resolvedHost = await (0, network_1.resolveIPv4IfNeeded)(base.host);
    const config = {
        host: resolvedHost,
        port: base.port,
        user: base.user,
        password: base.password,
        database: base.database,
        max: env_1.env.nodeEnv === 'production' ? 30 : 15, // 더 많은 연결로 동시성 향상 (25→30, 12→15)
        min: env_1.env.nodeEnv === 'production' ? 8 : 5, // Cold Start 최적화: 더 많은 연결 미리 유지 (5→8, 3→5)
        idleTimeoutMillis: 180000, // 3분으로 늘려서 연결 재사용 더 향상 (120s→180s)
        connectionTimeoutMillis: 3000, // 3초로 더 단축 (빠른 실패, 5s→3s)
        allowExitOnIdle: true,
        statement_timeout: 30000, // 30초로 복원 (복잡한 쿼리도 허용)
        query_timeout: 30000,
        // 고성능 최적화 설정들
        application_name: 'SseudamBackend-UltraFast',
        keepAlive: true, // TCP 연결 유지
        keepAliveInitialDelayMillis: 5000, // 5초로 단축 (10s→5s)
        // 추가 성능 최적화 옵션들 (적절한 타임아웃 설정)
        options: '--default_transaction_isolation=read_committed --statement_timeout=30s --lock_timeout=15s',
    };
    config.acquireTimeoutMillis = 2000; // 커넥션 획득 타임아웃
    if ((0, network_1.shouldUseTLS)(base.host)) {
        config.ssl = {
            rejectUnauthorized: env_1.env.databaseRejectUnauthorized,
        };
    }
    return config;
};
const getPool = async () => {
    if (!pool) {
        const config = await buildPoolConfig();
        pool = new pg_1.Pool(config);
        // 커넥션 풀 성능 모니터링 이벤트 리스너 추가
        pool.on('connect', () => {
            console.debug(`DB connection opened. Total: ${pool?.totalCount}, Idle: ${pool?.idleCount}, Waiting: ${pool?.waitingCount}`);
        });
        pool.on('acquire', () => {
            console.debug(`DB connection acquired. Active: ${pool?.totalCount - pool?.idleCount}`);
        });
        pool.on('release', () => {
            console.debug(`DB connection released. Idle: ${pool?.idleCount}`);
        });
        pool.on('error', (err) => {
            console.error('Unexpected DB pool error:', err);
        });
        // 풀 워밍업: 최소 연결 수만큼 미리 연결 생성
        const minConnections = config.min || 3;
        try {
            const warmupPromises = Array(minConnections).fill(null).map(async () => {
                const client = await pool.connect();
                client.release();
            });
            await Promise.all(warmupPromises);
            console.log(`DB pool warmed up with ${minConnections} connections`);
        }
        catch (err) {
            console.warn('Pool warmup failed:', err);
        }
    }
    return pool;
};
exports.getPool = getPool;
// 풀 상태 모니터링을 위한 유틸리티 함수
const getPoolStats = () => {
    if (!pool)
        return null;
    return {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
        activeCount: pool.totalCount - pool.idleCount,
    };
};
exports.getPoolStats = getPoolStats;
// 헬스체크용 함수
const testConnection = async () => {
    try {
        const currentPool = await (0, exports.getPool)();
        const client = await currentPool.connect();
        const result = await client.query('SELECT 1 as healthy');
        client.release();
        return result.rows[0]?.healthy === 1;
    }
    catch (error) {
        console.error('DB Health check failed:', error);
        return false;
    }
};
exports.testConnection = testConnection;
