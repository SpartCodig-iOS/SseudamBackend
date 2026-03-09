"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppDataSource = exports.createDataSourceConfig = exports.createDatabaseConfig = void 0;
const typeorm_1 = require("typeorm");
const env_1 = require("./env");
const network_1 = require("../utils/network");
const parseDatabaseUrl = (url) => {
    const parsed = new URL(url);
    return {
        host: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : 5432,
        username: decodeURIComponent(parsed.username),
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
        username: env_1.env.databaseUser,
        password: env_1.env.databasePassword ?? undefined,
        database: env_1.env.databaseName,
    };
};
const createDatabaseConfig = async () => {
    const base = env_1.env.databaseUrl ? parseDatabaseUrl(env_1.env.databaseUrl) : manualDatabaseConfig();
    const resolvedHost = await (0, network_1.resolveIPv4IfNeeded)(base.host);
    const config = {
        type: 'postgres',
        host: resolvedHost,
        port: base.port,
        username: base.username,
        password: base.password,
        database: base.database,
        // Entity 및 Migration 설정
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/../migrations/*{.ts,.js}'],
        synchronize: env_1.env.nodeEnv === 'development',
        logging: env_1.env.nodeEnv === 'development' ? ['error', 'warn'] : false,
        autoLoadEntities: true,
        // 연결 풀 설정
        extra: {
            max: env_1.env.nodeEnv === 'production' ? 20 : 10,
            min: env_1.env.nodeEnv === 'production' ? 2 : 0,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
            statement_timeout: 30000,
            query_timeout: 30000,
            application_name: 'SseudamBackend-TypeORM-Railway',
            options: '-c statement_timeout=30s -c lock_timeout=10s',
        },
    };
    // SSL 설정
    if ((0, network_1.shouldUseTLS)(base.host)) {
        config.ssl = {
            rejectUnauthorized: env_1.env.databaseRejectUnauthorized,
        };
    }
    return config;
};
exports.createDatabaseConfig = createDatabaseConfig;
// DataSource 설정 (마이그레이션용)
const createDataSourceConfig = async () => {
    const base = env_1.env.databaseUrl ? parseDatabaseUrl(env_1.env.databaseUrl) : manualDatabaseConfig();
    const resolvedHost = await (0, network_1.resolveIPv4IfNeeded)(base.host);
    const config = {
        type: 'postgres',
        host: resolvedHost,
        port: base.port,
        username: base.username,
        password: base.password,
        database: base.database,
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/../migrations/*{.ts,.js}'],
        synchronize: false,
        logging: true,
    };
    // SSL 설정
    if ((0, network_1.shouldUseTLS)(base.host)) {
        config.ssl = {
            rejectUnauthorized: env_1.env.databaseRejectUnauthorized,
        };
    }
    return config;
};
exports.createDataSourceConfig = createDataSourceConfig;
// TypeORM DataSource (CLI 사용)
exports.AppDataSource = new typeorm_1.DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    username: process.env.DATABASE_USER || 'postgres',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'sseduam',
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    synchronize: false,
});
