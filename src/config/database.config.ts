import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource, DataSourceOptions } from 'typeorm';
import { env } from './env';
import { resolveIPv4IfNeeded, shouldUseTLS } from '../utils/network';

const parseDatabaseUrl = (url: string) => {
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
  if (!env.databaseHost || !env.databaseUser || !env.databaseName) {
    throw new Error('DATABASE_* variables are incomplete. Provide DATABASE_URL or host/user/name.');
  }
  return {
    host: env.databaseHost,
    port: env.databasePort ?? 5432,
    username: env.databaseUser,
    password: env.databasePassword ?? undefined,
    database: env.databaseName,
  };
};

export const createDatabaseConfig = async (): Promise<TypeOrmModuleOptions> => {
  const base = env.databaseUrl ? parseDatabaseUrl(env.databaseUrl) : manualDatabaseConfig();
  const resolvedHost = await resolveIPv4IfNeeded(base.host);

  const config: TypeOrmModuleOptions & { ssl?: any } = {
    type: 'postgres',
    host: resolvedHost,
    port: base.port,
    username: base.username,
    password: base.password,
    database: base.database,

    // Entity 및 Migration 설정 (활성화된 모듈만)
    entities: [
      __dirname + '/../modules/auth/entities/*.entity{.ts,.js}',
      __dirname + '/../modules/user/entities/*.entity{.ts,.js}',
      __dirname + '/../modules/oauth/entities/*.entity{.ts,.js}',
      __dirname + '/../modules/profile/entities/*.entity{.ts,.js}',
      __dirname + '/../modules/notification/entities/*.entity{.ts,.js}',
      __dirname + '/../modules/meta/entities/*.entity{.ts,.js}',
      // Travel 관련 엔티티들
      __dirname + '/../modules/travel/entities/*.entity{.ts,.js}',
      __dirname + '/../modules/travel-expense/entities/*.entity{.ts,.js}',
      __dirname + '/../modules/travel-settlement/entities/*.entity{.ts,.js}',
    ],
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    synchronize: false, // 마이그레이션으로 관리
    logging: env.nodeEnv === 'development' ? ['error', 'warn'] : false,
    autoLoadEntities: true,

    // 연결 풀 설정
    extra: {
      max: env.nodeEnv === 'production' ? 20 : 10,
      min: env.nodeEnv === 'production' ? 2 : 0,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 30_000,
      query_timeout: 30_000,
      application_name: 'SseudamBackend-TypeORM-Railway',
      options: '-c statement_timeout=30s -c lock_timeout=10s',
    },
  };

  // SSL 설정
  if (shouldUseTLS(base.host)) {
    (config as any).ssl = {
      rejectUnauthorized: env.databaseRejectUnauthorized,
    };
  }

  return config;
};

// DataSource 설정 (마이그레이션용)
export const createDataSourceConfig = async (): Promise<DataSourceOptions> => {
  const base = env.databaseUrl ? parseDatabaseUrl(env.databaseUrl) : manualDatabaseConfig();
  const resolvedHost = await resolveIPv4IfNeeded(base.host);

  const config: DataSourceOptions = {
    type: 'postgres',
    host: resolvedHost,
    port: base.port,
    username: base.username,
    password: base.password,
    database: base.database,
    entities: [
      __dirname + '/../modules/auth/entities/*.entity{.ts,.js}',
      __dirname + '/../modules/user/entities/*.entity{.ts,.js}',
      __dirname + '/../modules/oauth/entities/*.entity{.ts,.js}',
      __dirname + '/../modules/profile/entities/*.entity{.ts,.js}',
      __dirname + '/../modules/notification/entities/*.entity{.ts,.js}',
      __dirname + '/../modules/meta/entities/*.entity{.ts,.js}',
      // Travel 관련 엔티티들
      __dirname + '/../modules/travel/entities/*.entity{.ts,.js}',
      __dirname + '/../modules/travel-expense/entities/*.entity{.ts,.js}',
      __dirname + '/../modules/travel-settlement/entities/*.entity{.ts,.js}',
    ],
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    synchronize: false,
    logging: true,
  };

  // SSL 설정
  if (shouldUseTLS(base.host)) {
    (config as any).ssl = {
      rejectUnauthorized: env.databaseRejectUnauthorized,
    };
  }

  return config;
};

// TypeORM DataSource (CLI 사용)
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'sseduam',
  entities: [
    __dirname + '/../modules/auth/entities/*.entity{.ts,.js}',
    __dirname + '/../modules/user/entities/*.entity{.ts,.js}',
    __dirname + '/../modules/oauth/entities/*.entity{.ts,.js}',
    __dirname + '/../modules/profile/entities/*.entity{.ts,.js}',
    __dirname + '/../modules/notification/entities/*.entity{.ts,.js}',
    __dirname + '/../modules/meta/entities/*.entity{.ts,.js}',
    // Travel 관련 엔티티들
    __dirname + '/../modules/travel/entities/*.entity{.ts,.js}',
    __dirname + '/../modules/travel-expense/entities/*.entity{.ts,.js}',
    __dirname + '/../modules/travel-settlement/entities/*.entity{.ts,.js}',
  ],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  synchronize: false,
});