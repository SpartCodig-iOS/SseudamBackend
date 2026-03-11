/**
 * profiles/test.ts
 *
 * 테스트 환경 기본값 프로필.
 * Jest, Testcontainers, E2E 테스트 실행 시 사용되는 격리된 기본값이다.
 * CI 파이프라인에서 별도 .env 없이 즉시 테스트가 실행 가능하도록 설계되었다.
 *
 * Testcontainers를 사용하는 경우, 이 기본값은 컨테이너가 시작된 후
 * 동적으로 덮어씌워질 수 있다.
 */

export interface TestProfileDefaults {
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
 * 테스트 환경 기본값.
 * - 로컬 DB는 별도 test 데이터베이스 사용 (운영/개발 DB 격리)
 * - 짧은 토큰 TTL로 만료 동작 테스트 용이
 * - 로그는 error만 출력하여 테스트 출력 오염 방지
 */
export const testDefaults: TestProfileDefaults = {
  NODE_ENV: 'test',
  PORT: '8081',
  LOG_LEVEL: 'error',

  // 테스트 전용 DB (개발 DB와 완전히 분리)
  DATABASE_HOST: 'localhost',
  DATABASE_PORT: '5432',
  DATABASE_USERNAME: 'postgres',
  DATABASE_PASSWORD: 'testpassword',
  DATABASE_NAME: 'sseudamtest',

  // 테스트 전용 JWT 시크릿
  JWT_SECRET: 'test-only-jwt-secret-minimum-32-chars-do-not-use-in-production',

  // 테스트용 짧은 TTL (만료 로직 테스트 가능)
  ACCESS_TOKEN_TTL_SECONDS: String(60 * 60),           // 1시간
  REFRESH_TOKEN_TTL_SECONDS: String(60 * 60 * 24 * 7), // 7일

  APP_BASE_URL: 'http://localhost:8081',
  APP_FORCE_UPDATE: 'false',

  CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://localhost:8081',

  REDIS_HOST: 'localhost',
  REDIS_PORT: '6379',
};

/**
 * 테스트 환경 기본값을 process.env에 병합한다.
 * 이미 존재하는 환경변수(예: Testcontainers가 주입한 값)는 보존한다.
 */
export function applyTestDefaults(): void {
  for (const [key, value] of Object.entries(testDefaults)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
