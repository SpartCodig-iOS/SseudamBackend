/**
 * env.schema.ts
 *
 * Zod 기반 환경변수 스키마 정의.
 * 타입 안전성과 기본값을 동시에 제공하며, 개발/테스트 환경에서
 * .env 파일 없이도 즉시 실행 가능한 기본값을 선언적으로 관리한다.
 */
import { z } from 'zod';

// ─────────────────────────────────────────────
// 헬퍼 파서
// ─────────────────────────────────────────────

const booleanFromString = z
  .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0'), z.literal('yes'), z.literal('no')])
  .optional()
  .transform((val) => {
    if (val === undefined) return undefined;
    return ['true', '1', 'yes'].includes(val.toLowerCase());
  });

const portSchema = z
  .string()
  .optional()
  .transform((val, ctx) => {
    if (!val || val.trim() === '') return undefined;
    const num = Number(val.trim());
    if (!Number.isFinite(num) || num < 1 || num > 65535) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid port: ${val}` });
      return z.NEVER;
    }
    return num;
  });

const positiveIntSchema = z
  .string()
  .optional()
  .transform((val) => {
    if (!val || val.trim() === '') return undefined;
    const num = Number(val.trim());
    return Number.isFinite(num) && num > 0 ? num : undefined;
  });

const commaSeparatedSchema = z
  .string()
  .optional()
  .transform((val) =>
    (val ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );

// ─────────────────────────────────────────────
// 환경변수 원시 스키마 (process.env 검증용)
// ─────────────────────────────────────────────

export const rawEnvSchema = z.object({
  // ── 런타임 ──────────────────────────────────
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .optional()
    .default('development'),

  PORT: portSchema,

  LOG_LEVEL: z
    .enum(['silent', 'error', 'warn', 'info', 'debug', 'verbose'])
    .optional(),

  // ── 데이터베이스 ─────────────────────────────
  RAILWAY_DATABASE_URL: z.string().url().optional(),
  DATABASE_URL: z.string().url().optional(),
  SUPABASE_DB_URL: z.string().url().optional(),
  SUPERBASE_DB_URL: z.string().url().optional(),

  DATABASE_HOST: z.string().optional(),
  DATABASE_PORT: portSchema,
  DATABASE_USERNAME: z.string().optional(),
  DATABASE_USER: z.string().optional(),
  DATABASE_PASSWORD: z.string().optional(),
  DATABASE_NAME: z.string().optional(),
  DATABASE_REQUIRE_TLS: booleanFromString,
  DATABASE_SSL_REJECT_UNAUTHORIZED: booleanFromString,
  DATABASE_FORCE_IPv4: booleanFromString,

  // ── JWT ──────────────────────────────────────
  JWT_SECRET: z.string().optional(),
  ACCESS_TOKEN_TTL_SECONDS: positiveIntSchema,
  REFRESH_TOKEN_TTL_SECONDS: positiveIntSchema,

  // ── Supabase ─────────────────────────────────
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPERBASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPERBASE_ANON_KEY: z.string().optional(),
  SUPABASE_URL: z.string().optional(),
  SUPERBASE_URL: z.string().optional(),
  SUPABASE_PROFILE_TABLE: z.string().optional(),
  SUPERBASE_PROFILE_TABLE: z.string().optional(),

  // ── Apple ────────────────────────────────────
  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_KEY_ID: z.string().optional(),
  APPLE_PRIVATE_KEY: z.string().optional(),
  APPLE_BUNDLE_ID: z.string().optional(),
  APPLE_APNS_PRODUCTION: booleanFromString,

  // ── Google ───────────────────────────────────
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),

  // ── Kakao ────────────────────────────────────
  KAKAO_CLIENT_ID: z.string().optional(),
  KAKAO_CLIENT_SECRET: z.string().optional(),
  KAKAO_REDIRECT_URI: z.string().url().optional(),

  // ── Redis ────────────────────────────────────
  REDIS_URL: z.string().optional(),
  REDIS_URI: z.string().optional(),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: portSchema,
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TLS: booleanFromString,

  // ── 앱 설정 ──────────────────────────────────
  APP_BASE_URL: z.string().url().optional(),
  APP_MIN_SUPPORTED_VERSION: z.string().optional(),
  APP_FORCE_UPDATE: booleanFromString,

  // ── CORS ─────────────────────────────────────
  CORS_ALLOWED_ORIGINS: commaSeparatedSchema,
  CORS_ORIGINS: commaSeparatedSchema,

  // ── Sentry ───────────────────────────────────
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_TRACES_SAMPLE_RATE: positiveIntSchema,
  SENTRY_PROFILES_SAMPLE_RATE: positiveIntSchema,
});

export type RawEnv = z.infer<typeof rawEnvSchema>;

// ─────────────────────────────────────────────
// 정규화된 최종 설정 타입
// ─────────────────────────────────────────────

export interface NormalizedEnv {
  nodeEnv: 'development' | 'test' | 'staging' | 'production';
  port: number;
  logLevel: string;

  databaseUrl: string | null;
  databaseHost: string | null;
  databasePort: number;
  databaseUser: string | null;
  databasePassword: string | null;
  databaseName: string | null;
  databaseRequireTLS: boolean | null;
  databaseRejectUnauthorized: boolean;
  databaseForceIPv4: boolean;

  jwtSecret: string;
  accessTokenTTL: number;
  refreshTokenTTL: number;

  supabaseServiceRoleKey: string;
  supabaseUrl: string;
  supabaseProjectRef: string | null;
  supabaseProfileTable: string;

  appleClientId: string | null;
  appleTeamId: string | null;
  appleKeyId: string | null;
  applePrivateKey: string | null;
  appleBundleId: string;
  appleApnsProduction: boolean | undefined;

  googleClientId: string | null;
  googleClientSecret: string | null;
  googleRedirectUri: string | null;

  kakaoClientId: string | null;
  kakaoClientSecret: string | null;
  kakaoRedirectUri: string | null;

  redisUrl: string | null;
  redisHost: string;
  redisPort: number;
  redisPassword: string | undefined;
  redisTls: boolean;

  appBaseUrl: string;
  appMinSupportedVersion: string | null;
  appForceUpdate: boolean;

  corsOrigins: string[];

  sentryDsn: string | null;
  sentryTracesSampleRate: number;
  sentryProfilesSampleRate: number;
}
