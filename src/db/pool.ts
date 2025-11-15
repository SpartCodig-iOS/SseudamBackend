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
    max: env.nodeEnv === 'production' ? 30 : 15, // 더 많은 연결로 동시성 향상 (25→30, 12→15)
    min: env.nodeEnv === 'production' ? 8 : 5, // Cold Start 최적화: 더 많은 연결 미리 유지 (5→8, 3→5)
    idleTimeoutMillis: 180_000, // 3분으로 늘려서 연결 재사용 더 향상 (120s→180s)
    connectionTimeoutMillis: 3_000, // 3초로 더 단축 (빠른 실패, 5s→3s)
    allowExitOnIdle: true,
    statement_timeout: 30_000, // 30초로 복원 (복잡한 쿼리도 허용)
    query_timeout: 30_000,
    // 고성능 최적화 설정들
    application_name: 'SseudamBackend-UltraFast',
    keepAlive: true, // TCP 연결 유지
    keepAliveInitialDelayMillis: 5000, // 5초로 단축 (10s→5s)
    // 추가 성능 최적화 옵션들 (적절한 타임아웃 설정)
    options: '--default_transaction_isolation=read_committed --statement_timeout=30s --lock_timeout=15s',
  };

  (config as PoolConfig & { acquireTimeoutMillis?: number }).acquireTimeoutMillis = 2_000; // 커넥션 획득 타임아웃

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

    // 커넥션 풀 성능 모니터링 이벤트 리스너 추가
    pool.on('connect', (client) => {
      console.debug(`📡 DB Connection opened. Total: ${pool?.totalCount}, Idle: ${pool?.idleCount}, Waiting: ${pool?.waitingCount}`);
    });

    pool.on('acquire', () => {
      console.debug(`🔄 DB Connection acquired. Active: ${pool?.totalCount! - pool?.idleCount!}`);
    });

    pool.on('release', () => {
      console.debug(`✅ DB Connection released. Idle: ${pool?.idleCount}`);
    });

    pool.on('error', (err) => {
      console.error('❌ Unexpected DB pool error:', err);
    });

    // 풀 워밍업: 최소 연결 수만큼 미리 연결 생성
    const minConnections = config.min || 3;
    try {
      const warmupPromises = Array(minConnections).fill(null).map(async () => {
        const client = await pool!.connect();
        client.release();
      });
      await Promise.all(warmupPromises);
      console.log(`🔥 DB Pool warmed up with ${minConnections} connections`);
    } catch (err) {
      console.warn('⚠️ Pool warmup failed:', err);
    }
  }
  return pool;
};

// 풀 상태 모니터링을 위한 유틸리티 함수
export const getPoolStats = () => {
  if (!pool) return null;

  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
    activeCount: pool.totalCount - pool.idleCount,
  };
};

// 헬스체크용 함수
export const testConnection = async (): Promise<boolean> => {
  try {
    const currentPool = await getPool();
    const client = await currentPool.connect();
    const result = await client.query('SELECT 1 as healthy');
    client.release();
    return result.rows[0]?.healthy === 1;
  } catch (error) {
    console.error('DB Health check failed:', error);
    return false;
  }
};
