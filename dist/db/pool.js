"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPool = void 0;
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
        max: env_1.env.nodeEnv === 'production' ? 25 : 12, // 더 많은 연결로 동시성 향상
        min: env_1.env.nodeEnv === 'production' ? 5 : 3, // Cold Start 최적화: 미리 연결 유지
        idleTimeoutMillis: 120000, // 2분으로 늘려서 연결 재사용 향상
        connectionTimeoutMillis: 5000, // 5초로 단축 (빠른 실패)
        allowExitOnIdle: true,
        statement_timeout: 15000, // 15초로 단축 (빠른 쿼리 강제)
        query_timeout: 15000,
        // Cold Start 최적화: 연결 검증 간소화
        application_name: 'SseudamBackend-Fast',
        keepAlive: true, // TCP 연결 유지
        keepAliveInitialDelayMillis: 10000,
    };
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
    }
    return pool;
};
exports.getPool = getPool;
