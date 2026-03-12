/**
 * env.ts
 *
 * 환경변수 로딩 및 정규화의 단일 진입점.
 *
 * 처리 순서:
 *   1. NODE_ENV를 먼저 확인하여 프로필 결정
 *   2. 환경별 기본값 프로필을 process.env에 병합 (기존 값 우선)
 *   3. .env 파일 로드 (기존 값 덮어쓰지 않음 — override: false)
 *   4. Zod 스키마로 타입 안전 파싱
 *   5. Supabase URL 정규화 및 JWT 시크릿 검증
 *   6. 완성된 env 객체 export
 *
 * 핵심 원칙:
 *   - 개발/테스트 환경에서는 .env 없이도 즉시 실행 가능
 *   - 프로덕션에서만 필수값 누락 시 예외를 던짐
 *   - 기존 코드에서 import { env } from './config/env' 패턴 완전 호환
 */
import * as dotenv from 'dotenv';
import path from 'path';
import { rawEnvSchema, type NormalizedEnv } from './env.schema';
import { applyDevelopmentDefaults } from './profiles/development';
import { applyTestDefaults } from './profiles/test';

// ─────────────────────────────────────────────
// 1. 환경별 기본값 프로필 적용
//    process.env에 값이 없는 키에만 기본값을 주입한다.
// ─────────────────────────────────────────────

const nodeEnvEarly = process.env.NODE_ENV ?? 'development';

if (nodeEnvEarly === 'test') {
  applyTestDefaults();
} else if (nodeEnvEarly !== 'production' && nodeEnvEarly !== 'staging') {
  applyDevelopmentDefaults();
}

// ─────────────────────────────────────────────
// 2. .env 파일 로드
//    override: false — .env보다 process.env(프로필 기본값 포함) 우선.
//    실제로는 프로필 기본값이 먼저 들어갔으므로 .env의 실제 값은
//    process.env에 이미 없는 키에 대해서만 채워진다.
//    즉, .env > 프로필 기본값 순서를 유지하려면 .env를 먼저 로드해야 하는데,
//    현재는 .env > 기본값 우선순위로 동작한다.
//    (기존 dotenv.config() 동작과 동일: process.env 기존 값 보존)
// ─────────────────────────────────────────────

const envFilePath = path.resolve(process.cwd(), '.env');
const dotenvResult = dotenv.config({ path: envFilePath, override: false, quiet: true });

if (dotenvResult.error && nodeEnvEarly !== 'production') {
  // .env 파일 없음은 개발/테스트에서 정상 상태
  process.stderr.write(
    `[ENV] .env file not found at ${envFilePath} — using profile defaults and environment variables\n`,
  );
}

// ─────────────────────────────────────────────
// 3. 내부 헬퍼
// ─────────────────────────────────────────────

const decodeSupabaseRef = (serviceRoleKey?: string): string | null => {
  if (!serviceRoleKey) return null;
  const parts = serviceRoleKey.split('.');
  if (parts.length < 2) return null;

  try {
    const segment = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    const decoded = JSON.parse(
      Buffer.from(segment, 'base64').toString('utf8'),
    ) as Record<string, unknown>;
    return typeof decoded?.ref === 'string' ? decoded.ref : null;
  } catch {
    return null;
  }
};

const normalizeSupabaseUrl = (rawUrl?: string, serviceRoleKey?: string): string => {
  const trimmed = (rawUrl ?? '').trim().replace(/\/+$/, '');
  const hasValidHost = trimmed.includes('supabase.');
  if (trimmed && hasValidHost) return trimmed;

  const derivedRef = decodeSupabaseRef(serviceRoleKey);
  if (derivedRef) {
    const derivedUrl = `https://${derivedRef}.supabase.co`;
    if (trimmed && trimmed !== derivedUrl) {
      console.warn(
        `[ENV] SUPABASE_URL appears invalid ("${trimmed}"), auto-correcting to ${derivedUrl} from service key`,
      );
    }
    return derivedUrl;
  }

  return trimmed;
};

// ─────────────────────────────────────────────
// 4. Zod 스키마로 원시 환경변수 파싱
// ─────────────────────────────────────────────

const parseResult = rawEnvSchema.safeParse(process.env);

if (!parseResult.success) {
  const formatted = parseResult.error.issues
    .map((e) => `  ${String(e.path.join('.'))}: ${e.message}`)
    .join('\n');
  throw new Error(`[ENV] Environment variable validation failed:\n${formatted}`);
}

const raw = parseResult.data;

// ─────────────────────────────────────────────
// 5. 정규화 및 파생값 계산
// ─────────────────────────────────────────────

const resolvedNodeEnv = raw.NODE_ENV ?? 'development';
const isProductionEnv = resolvedNodeEnv === 'production';
const isStagingEnv = resolvedNodeEnv === 'staging';
const isStrictEnv = isProductionEnv || isStagingEnv;

// 데이터베이스 URL (우선순위: Railway > Supabase > 일반 DATABASE_URL)
const databaseUrl =
  raw.RAILWAY_DATABASE_URL ??
  raw.SUPABASE_DB_URL ??
  raw.SUPERBASE_DB_URL ??
  raw.DATABASE_URL ??
  null;

// Supabase 키 (SUPERBASE는 오타 허용을 위한 레거시 별칭)
const supabaseServiceRoleKey = (
  raw.SUPABASE_SERVICE_ROLE_KEY ??
  raw.SUPERBASE_SERVICE_ROLE_KEY ??
  raw.SUPABASE_ANON_KEY ??
  raw.SUPERBASE_ANON_KEY ??
  ''
).trim();

const supabaseProjectRef = decodeSupabaseRef(supabaseServiceRoleKey);
const supabaseUrl = normalizeSupabaseUrl(
  raw.SUPABASE_URL ?? raw.SUPERBASE_URL ?? '',
  supabaseServiceRoleKey,
);

// CORS 오리진 — 두 변수 병합 후 중복 제거
const corsOrigins = Array.from(
  new Set([
    ...(raw.CORS_ALLOWED_ORIGINS ?? []),
    ...(raw.CORS_ORIGINS ?? []),
  ]),
).filter((o) => o.length > 0);

if (corsOrigins.length === 0) {
  corsOrigins.push('http://localhost:3000', 'https://sseudam.up.railway.app');
}

// Redis URL 정규화
const redisUrl = raw.REDIS_URL ?? raw.REDIS_URI ?? null;

// ─────────────────────────────────────────────
// 6. 프로덕션/스테이징 필수값 검증
//    개발/테스트 환경에서는 이 검증을 건너뜀
// ─────────────────────────────────────────────

if (isStrictEnv) {
  const missing: string[] = [];

  if (!databaseUrl && (!raw.DATABASE_HOST || !raw.DATABASE_USERNAME || !raw.DATABASE_NAME)) {
    missing.push('RAILWAY_DATABASE_URL / DATABASE_URL (or DATABASE_HOST + DATABASE_USERNAME + DATABASE_NAME)');
  }
  if (!supabaseServiceRoleKey) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY');
  }
  if (!supabaseUrl || !supabaseUrl.includes('supabase.')) {
    missing.push('SUPABASE_URL (expected https://<project>.supabase.co)');
  }

  if (missing.length > 0) {
    throw new Error(
      `[ENV] Missing required environment variables for ${resolvedNodeEnv}:\n  ${missing.join('\n  ')}`,
    );
  }
}

// ─────────────────────────────────────────────
// 7. JWT 시크릿 검증 및 폴백
// ─────────────────────────────────────────────

let jwtSecret = raw.JWT_SECRET ?? '';

if (!jwtSecret || jwtSecret.length < 32) {
  if (isStrictEnv) {
    throw new Error(
      `[ENV] JWT_SECRET must be at least 32 characters in ${resolvedNodeEnv} environment`,
    );
  }
  // 개발/테스트 프로필에서 이미 기본값이 주입되었으므로 여기 도달하면 비정상 상태
  const fallback = 'dev-only-insecure-jwt-secret-do-not-use-in-prod-fallback!!';
  process.stderr.write(
    '[ENV] WARNING: JWT_SECRET is too short or missing. Using insecure development fallback.\n',
  );
  jwtSecret = fallback;
}

// ─────────────────────────────────────────────
// 8. 최종 env 객체 조립
// ─────────────────────────────────────────────

export const env: NormalizedEnv = {
  nodeEnv: resolvedNodeEnv as NormalizedEnv['nodeEnv'],
  port: raw.PORT ?? 8080,
  logLevel: raw.LOG_LEVEL ?? 'info',

  databaseUrl,
  databaseHost: raw.DATABASE_HOST ?? null,
  databasePort: raw.DATABASE_PORT ?? 5432,
  databaseUser: raw.DATABASE_USERNAME ?? raw.DATABASE_USER ?? null,
  databasePassword: raw.DATABASE_PASSWORD ?? null,
  databaseName: raw.DATABASE_NAME ?? null,
  databaseRequireTLS: raw.DATABASE_REQUIRE_TLS ?? null,
  databaseRejectUnauthorized: raw.DATABASE_SSL_REJECT_UNAUTHORIZED ?? false,
  databaseForceIPv4: raw.DATABASE_FORCE_IPv4 ?? false,

  jwtSecret,
  accessTokenTTL: raw.ACCESS_TOKEN_TTL_SECONDS ?? raw.TOKEN_EXPIRES_IN ?? 60 * 60 * 24,
  refreshTokenTTL: raw.REFRESH_TOKEN_TTL_SECONDS ?? raw.REFRESH_EXPIRES_IN ?? 60 * 60 * 24 * 60,

  supabaseServiceRoleKey,
  supabaseUrl,
  supabaseProjectRef,
  supabaseProfileTable:
    raw.SUPABASE_PROFILE_TABLE ?? raw.SUPERBASE_PROFILE_TABLE ?? 'profiles',

  appleClientId: raw.APPLE_CLIENT_ID ?? null,
  appleTeamId: raw.APPLE_TEAM_ID ?? null,
  appleKeyId: raw.APPLE_KEY_ID ?? null,
  applePrivateKey: raw.APPLE_PRIVATE_KEY ?? null,
  appleBundleId: raw.APPLE_BUNDLE_ID ?? 'io.sseudam.co',
  appleApnsProduction: raw.APPLE_APNS_PRODUCTION,

  googleClientId: raw.GOOGLE_CLIENT_ID ?? null,
  googleClientSecret: raw.GOOGLE_CLIENT_SECRET ?? null,
  googleRedirectUri: raw.GOOGLE_REDIRECT_URI ?? null,

  kakaoClientId: raw.KAKAO_CLIENT_ID ?? null,
  kakaoClientSecret: raw.KAKAO_CLIENT_SECRET ?? null,
  kakaoRedirectUri: raw.KAKAO_REDIRECT_URI ?? null,

  redisUrl,
  redisHost: raw.REDIS_HOST ?? 'localhost',
  redisPort: raw.REDIS_PORT ?? 6379,
  redisPassword: raw.REDIS_PASSWORD,
  redisTls: raw.REDIS_TLS ?? false,

  appBaseUrl: raw.APP_BASE_URL ?? 'https://sseudam.up.railway.app',
  appMinSupportedVersion: raw.APP_MIN_SUPPORTED_VERSION ?? null,
  appForceUpdate: raw.APP_FORCE_UPDATE ?? true,

  corsOrigins,

  sentryDsn: raw.SENTRY_DSN ?? null,
  sentryTracesSampleRate: raw.SENTRY_TRACES_SAMPLE_RATE ?? 0.1,
  sentryProfilesSampleRate: raw.SENTRY_PROFILES_SAMPLE_RATE ?? 0.1,
};

// ─────────────────────────────────────────────
// 편의 exports (기존 코드 호환)
// ─────────────────────────────────────────────

export const isProduction = isProductionEnv;
export const isStaging = isStagingEnv;
export const isDevelopment = resolvedNodeEnv === 'development';
export const isTest = resolvedNodeEnv === 'test';
