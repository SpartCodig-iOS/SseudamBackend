import { Pool, PoolConfig } from 'pg';
import { env } from '../config/env';
import { resolveIPv4IfNeeded, shouldUseTLS } from '../utils/network';

let pool: Pool | null = null;

const parseDatabaseUrl = (url: string) => {
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
  if (!env.databaseHost || !env.databaseUser || !env.databaseName) {
    throw new Error('DATABASE_* variables are incomplete. Provide DATABASE_URL or host/user/name.');
  }
  return {
    host: env.databaseHost,
    port: env.databasePort ?? 5432,
    user: env.databaseUser,
    password: env.databasePassword ?? undefined,
    database: env.databaseName,
  };
};

const buildPoolConfig = async (): Promise<PoolConfig> => {
  const base = env.databaseUrl ? parseDatabaseUrl(env.databaseUrl) : manualDatabaseConfig();
  const resolvedHost = await resolveIPv4IfNeeded(base.host);

  const config: PoolConfig = {
    host: resolvedHost,
    port: base.port,
    user: base.user,
    password: base.password,
    database: base.database,
    max: env.nodeEnv === 'production' ? 25 : 12, // 더 많은 연결로 동시성 향상
    min: env.nodeEnv === 'production' ? 5 : 3, // Cold Start 최적화: 미리 연결 유지
    idleTimeoutMillis: 120_000, // 2분으로 늘려서 연결 재사용 향상
    connectionTimeoutMillis: 5_000, // 5초로 단축 (빠른 실패)
    allowExitOnIdle: true,
    statement_timeout: 15_000, // 15초로 단축 (빠른 쿼리 강제)
    query_timeout: 15_000,
    // Cold Start 최적화: 연결 검증 간소화
    application_name: 'SseudamBackend-Fast',
    keepAlive: true, // TCP 연결 유지
    keepAliveInitialDelayMillis: 10000,
  };

  if (shouldUseTLS(base.host)) {
    config.ssl = {
      rejectUnauthorized: env.databaseRejectUnauthorized,
    };
  }

  return config;
};

export const getPool = async (): Promise<Pool> => {
  if (!pool) {
    const config = await buildPoolConfig();
    pool = new Pool(config);
  }
  return pool;
};
