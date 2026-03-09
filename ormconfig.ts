import { DataSource } from 'typeorm';
import { config } from 'dotenv';

// 환경변수 로드
config();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  username: process.env.DATABASE_USER || process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'sseduam',

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