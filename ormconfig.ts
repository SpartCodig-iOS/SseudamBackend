import { DataSource } from 'typeorm';
import { config } from 'dotenv';

// 환경변수 로드
config();

// DATABASE_URL 파싱 함수
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

// DATABASE_URL이 있으면 파싱해서 사용, 없으면 개별 변수 사용
const databaseUrl = process.env.RAILWAY_DATABASE_URL || process.env.DATABASE_URL;
const dbConfig = databaseUrl
  ? parseDatabaseUrl(databaseUrl)
  : {
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432'),
      username: process.env.DATABASE_USER || process.env.DATABASE_USERNAME || 'postgres',
      password: process.env.DATABASE_PASSWORD || '',
      database: process.env.DATABASE_NAME || 'sseduam',
    };

const AppDataSource = new DataSource({
  type: 'postgres',
  host: dbConfig.host,
  port: dbConfig.port,
  username: dbConfig.username,
  password: dbConfig.password,
  database: dbConfig.database,

  // SSL 설정 (production 환경에서)
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false,

  // 엔티티와 마이그레이션 파일 경로
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],

  // CLI 전용 설정
  synchronize: false, // 마이그레이션 사용을 위해 false
  logging: ['error', 'warn', 'migration'],

  // 마이그레이션 옵션
  migrationsTableName: 'typeorm_migrations',
  migrationsRun: false,
});

export default AppDataSource;