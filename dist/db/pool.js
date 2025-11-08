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
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
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
