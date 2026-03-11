/**
 * database.config.ts
 *
 * TypeORM 연결 설정 팩토리.
 * env 객체의 기본값 덕분에 개발환경에서는 DATABASE_* 변수 없이도
 * localhost:5432/sseudamdev 로 즉시 연결 시도한다.
 *
 * 연결 소스 우선순위:
 *   1. databaseUrl (DATABASE_URL / RAILWAY_DATABASE_URL 등 단일 연결 문자열)
 *   2. databaseHost + databaseUser + databaseName (개별 환경변수 또는 기본값)
 */
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource, DataSourceOptions } from 'typeorm';
import { env, isDevelopment, isTest } from './env';
import { resolveIPv4IfNeeded, shouldUseTLS } from '../common/utils/network';

// ─────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────

interface DbConnectionParams {
  host: string;
  port: number;
  username: string;
  password: string | undefined;
  database: string;
}

const parseDatabaseUrl = (url: string): DbConnectionParams => {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    username: decodeURIComponent(parsed.username),
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    database: parsed.pathname.replace(/^\//, ''),
  };
};

/**
 * 개별 환경변수(또는 개발 기본값)로 연결 파라미터를 구성한다.
 * 개발/테스트 환경에서 기본값이 이미 env 객체에 채워져 있으므로
 * 이전처럼 예외를 던지지 않는다.
 */
const buildManualConnectionParams = (): DbConnectionParams => {
  const host = env.databaseHost ?? 'localhost';
  const username = env.databaseUser ?? 'postgres';
  const database = env.databaseName ?? 'sseudamdev';

  if (env.nodeEnv === 'production' || env.nodeEnv === 'staging') {
    if (!env.databaseHost || !env.databaseUser || !env.databaseName) {
      throw new Error(
        '[DB] DATABASE_* variables are incomplete for production. ' +
          'Provide DATABASE_URL or DATABASE_HOST + DATABASE_USERNAME + DATABASE_NAME.',
      );
    }
  }

  return {
    host,
    port: env.databasePort ?? 5432,
    username,
    password: env.databasePassword ?? undefined,
    database,
  };
};

const resolveConnectionParams = (): DbConnectionParams => {
  if (env.databaseUrl) {
    return parseDatabaseUrl(env.databaseUrl);
  }
  return buildManualConnectionParams();
};

// ─────────────────────────────────────────────
// TypeORM 설정 팩토리 (NestJS 모듈용)
// ─────────────────────────────────────────────

export const createDatabaseConfig = async (): Promise<TypeOrmModuleOptions> => {
  const base = resolveConnectionParams();
  const resolvedHost = await resolveIPv4IfNeeded(base.host);

  const isLocalEnv = isDevelopment || isTest;

  const config: TypeOrmModuleOptions & { ssl?: unknown } = {
    type: 'postgres',
    host: resolvedHost,
    port: base.port,
    username: base.username,
    password: base.password,
    database: base.database,

    // 엔티티 & 마이그레이션
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],

    // synchronize는 항상 false로 설정 (프로덕션/개발 모두 마이그레이션 사용)
    // 이전에 isLocalEnv 조건으로 개발환경에서만 true였으나,
    // 실제 DB 스키마와 entity 불일치로 인해 데이터 손실 위험이 있으므로 비활성화.
    synchronize: false,
    logging: isLocalEnv ? ['error', 'warn'] : false,
    autoLoadEntities: true,

    // 연결 풀 설정
    extra: {
      max: env.nodeEnv === 'production' ? 20 : 5,
      min: env.nodeEnv === 'production' ? 2 : 0,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: isLocalEnv ? 10_000 : 5_000,
      statement_timeout: 30_000,
      query_timeout: 30_000,
      application_name: `SseudamBackend-${env.nodeEnv}`,
      options: '-c statement_timeout=30s -c lock_timeout=10s',
    },

    // 연결 실패 시 재시도 (로컬 DB가 아직 기동 중일 수 있음)
    retryAttempts: isLocalEnv ? 5 : 3,
    retryDelay: isLocalEnv ? 3000 : 1000,
  };

  // SSL 설정 (로컬호스트는 자동으로 TLS 비활성화)
  if (shouldUseTLS(base.host)) {
    (config as any).ssl = {
      rejectUnauthorized: env.databaseRejectUnauthorized,
    };
  }

  return config;
};

// ─────────────────────────────────────────────
// DataSource 설정 (Drizzle CLI / 마이그레이션용)
// ─────────────────────────────────────────────

export const createDataSourceConfig = async (): Promise<DataSourceOptions> => {
  const base = resolveConnectionParams();
  const resolvedHost = await resolveIPv4IfNeeded(base.host);

  const config: DataSourceOptions & { ssl?: unknown } = {
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

  if (shouldUseTLS(base.host)) {
    (config as any).ssl = {
      rejectUnauthorized: env.databaseRejectUnauthorized,
    };
  }

  return config;
};

// ─────────────────────────────────────────────
// AppDataSource (TypeORM CLI 전용)
// ─────────────────────────────────────────────

/**
 * TypeORM CLI(npx typeorm migration:run 등)에서 사용하는 정적 DataSource.
 * CLI는 async 팩토리를 지원하지 않으므로 process.env를 직접 읽는다.
 * env 모듈이 이미 기본값을 주입했으므로 여기서도 기본값이 적용된다.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
  username: process.env.DATABASE_USERNAME ?? process.env.DATABASE_USER ?? 'postgres',
  password: process.env.DATABASE_PASSWORD ?? 'devpassword',
  database: process.env.DATABASE_NAME ?? 'sseudamdev',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  synchronize: false,
  logging: false,
});
