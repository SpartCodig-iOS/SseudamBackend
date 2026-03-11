/**
 * profiles/development.ts
 *
 * 개발환경 기본값 프로필.
 * .env 파일이 없거나 특정 변수가 누락된 경우에 사용되는 폴백 값이다.
 * 이 파일에 정의된 값들은 실제 환경변수보다 우선순위가 낮으며,
 * process.env에 해당 키가 존재하면 무시된다.
 *
 * 주의: 이 시크릿 값들은 개발 전용이며 절대로 프로덕션에 사용하지 말 것.
 */

export interface DevProfileDefaults {
  NODE_ENV: string;
  PORT: string;
  LOG_LEVEL: string;

  DATABASE_HOST: string;
  DATABASE_PORT: string;
  DATABASE_USERNAME: string;
  DATABASE_PASSWORD: string;
  DATABASE_NAME: string;

  JWT_SECRET: string;
  ACCESS_TOKEN_TTL_SECONDS: string;
  REFRESH_TOKEN_TTL_SECONDS: string;

  APP_BASE_URL: string;
  APP_FORCE_UPDATE: string;

  CORS_ALLOWED_ORIGINS: string;

  REDIS_HOST: string;
  REDIS_PORT: string;
}

/**
 * 개발환경 기본값.
 * PostgreSQL은 로컬 Docker Compose 또는 네이티브 설치 기준.
 * Redis가 없어도 메모리 캐시로 폴백하므로 필수가 아니다.
 */
export const developmentDefaults: DevProfileDefaults = {
  NODE_ENV: 'development',
  PORT: '8080',
  LOG_LEVEL: 'debug',

  // 로컬 PostgreSQL 기본값
  // docker run -e POSTGRES_DB=sseudamdev -e POSTGRES_PASSWORD=devpassword -p 5432:5432 postgres:16
  DATABASE_HOST: 'localhost',
  DATABASE_PORT: '5432',
  DATABASE_USERNAME: 'postgres',
  DATABASE_PASSWORD: 'devpassword',
  DATABASE_NAME: 'sseudamdev',

  // 개발 전용 JWT 시크릿 (32자 이상, 프로덕션 절대 사용 금지)
  JWT_SECRET: 'dev-only-jwt-secret-minimum-32-chars-do-not-use-in-production',

  // 토큰 유효기간 (개발환경: 더 길게 설정하여 재로그인 최소화)
  ACCESS_TOKEN_TTL_SECONDS: String(60 * 60 * 24 * 7),   // 7일
  REFRESH_TOKEN_TTL_SECONDS: String(60 * 60 * 24 * 90), // 90일

  APP_BASE_URL: 'http://localhost:8080',
  APP_FORCE_UPDATE: 'false',

  CORS_ALLOWED_ORIGINS: [
    'http://localhost:3000',
    'http://localhost:8080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8080',
  ].join(','),

  // Redis (선택적 - 없으면 메모리 캐시로 폴백)
  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
};

/**
 * 개발환경 기본값을 process.env에 병합한다.
 * 이미 존재하는 환경변수는 덮어쓰지 않는다 (기존 .env 값 우선).
 */
export function applyDevelopmentDefaults(): void {
  for (const [key, value] of Object.entries(developmentDefaults)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
