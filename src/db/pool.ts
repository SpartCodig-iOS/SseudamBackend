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
    max: env.nodeEnv === 'production' ? 20 : 10, // Railway 친화적 연결 수 감소
    min: env.nodeEnv === 'production' ? 2 : 0,   // Sleep 모드를 위해 최소 연결 대폭 감소
    idleTimeoutMillis: 30_000, // 30초로 단축 (빠른 연결 해제로 Sleep 모드 지원)
    connectionTimeoutMillis: 5_000, // 5초 (안정성과 속도의 균형)
    allowExitOnIdle: true, // Railway Sleep 모드 지원 활성화
    statement_timeout: 30_000,
    query_timeout: 30_000,
    application_name: 'SseudamBackend-Railway-Optimized',
    keepAlive: false, // Railway Sleep 모드를 위해 Keep-Alive 비활성화
    // Railway Sleep 친화적 최적화 설정 (GUC 전달 시 공백 이슈 방지를 위해 isolation 설정 제거)
    options: '-c statement_timeout=30s -c lock_timeout=10s',
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
    pool.on('connect', () => {
      console.debug(`DB connection opened. Total: ${pool?.totalCount}, Idle: ${pool?.idleCount}, Waiting: ${pool?.waitingCount}`);
    });

    pool.on('acquire', () => {
      console.debug(`DB connection acquired. Active: ${pool?.totalCount! - pool?.idleCount!}`);
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
          const client = await pool!.connect();
          client.release();
        });
        await Promise.all(warmupPromises);
        console.log(`DB pool warmed up with ${minConnections} connections`);
      } catch (err) {
        console.warn('Pool warmup failed:', err);
      }
    })();
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
