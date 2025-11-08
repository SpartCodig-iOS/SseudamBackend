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
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
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
