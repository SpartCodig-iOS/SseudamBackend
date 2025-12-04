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
        max: env_1.env.nodeEnv === 'production' ? 20 : 10, // Railway 친화적 연결 수 감소
        min: env_1.env.nodeEnv === 'production' ? 2 : 0, // Sleep 모드를 위해 최소 연결 대폭 감소
        idleTimeoutMillis: 30000, // 30초로 단축 (빠른 연결 해제로 Sleep 모드 지원)
        connectionTimeoutMillis: 5000, // 5초 (안정성과 속도의 균형)
        allowExitOnIdle: true, // Railway Sleep 모드 지원 활성화
        statement_timeout: 30000,
        query_timeout: 30000,
        application_name: 'SseudamBackend-Railway-Optimized',
        keepAlive: false, // Railway Sleep 모드를 위해 Keep-Alive 비활성화
        // Railway Sleep 친화적 최적화 설정 (GUC 전달 시 공백 이슈 방지를 위해 isolation 설정 제거)
        options: '-c statement_timeout=30s -c lock_timeout=10s',
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
        // 비동기 워밍업으로 헬스체크 초기 응답 지연 방지
        void (async () => {
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
        })();
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
