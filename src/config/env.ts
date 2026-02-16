import 'dotenv/config';

const truthy = (value?: string): boolean => {
  if (!value) return false;
  return ['1', 'true', 'yes', 'y', 'on'].includes(value.toLowerCase());
};

const optionalNumber = (value?: string, fallback?: number): number | undefined => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const decodeSupabaseRef = (serviceRoleKey?: string): string | null => {
  if (!serviceRoleKey) return null;
  const parts = serviceRoleKey.split('.');
  if (parts.length < 2) return null;

  try {
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as Record<string, unknown>;
    const ref = decoded?.ref;
    return typeof ref === 'string' ? ref : null;
  } catch {
    return null;
  }
};

const normalizeSupabaseUrl = (rawUrl?: string, serviceRoleKey?: string): string => {
  const trimmed = (rawUrl ?? '').trim().replace(/\/+$/, '');
  const hasValidHost = trimmed.includes('supabase.');
  if (trimmed && hasValidHost) {
    return trimmed;
  }

  const derivedRef = decodeSupabaseRef(serviceRoleKey);
  if (derivedRef) {
    const derivedUrl = `https://${derivedRef}.supabase.co`;
    if (trimmed && trimmed !== derivedUrl) {
      console.warn(`[ENV] SUPABASE_URL appears invalid ("${trimmed}"), auto-correcting to ${derivedUrl} from service key`);
    }
    return derivedUrl;
  }

  return trimmed;
};

const databaseUrl =
  process.env.RAILWAY_DATABASE_URL ||
  process.env.SUPERBASE_DB_URL ||
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL ||
  process.env.DATABASE_URL?.trim();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 8080),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  databaseUrl: databaseUrl ?? null,
  databaseHost: process.env.DATABASE_HOST ?? null,
  databasePort: optionalNumber(process.env.DATABASE_PORT, 5432),
  databaseUser: process.env.DATABASE_USERNAME ?? process.env.DATABASE_USER ?? null,
  databasePassword: process.env.DATABASE_PASSWORD ?? null,
  databaseName: process.env.DATABASE_NAME ?? null,
  databaseRequireTLS: process.env.DATABASE_REQUIRE_TLS ? truthy(process.env.DATABASE_REQUIRE_TLS) : null,
  databaseRejectUnauthorized: truthy(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED) ?? false,
  databaseForceIPv4: truthy(process.env.DATABASE_FORCE_IPv4) ?? false,
  jwtSecret: process.env.JWT_SECRET ?? 'secret',
  accessTokenTTL: optionalNumber(process.env.ACCESS_TOKEN_TTL_SECONDS, 60 * 60 * 24) ?? 60 * 60 * 24,
  refreshTokenTTL: optionalNumber(process.env.REFRESH_TOKEN_TTL_SECONDS, 60 * 60 * 24 * 60) ?? 60 * 60 * 24 * 60,
  supabaseServiceRoleKey: (
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPERBASE_SERVICE_ROLE_KEY ??
    process.env.SUPERBASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    ''
  ).trim(),
  supabaseUrl: '', // 값은 아래에서 service key 기반으로 정규화
  supabaseProjectRef: null as string | null,
  supabaseProfileTable:
    process.env.SUPERBASE_PROFILE_TABLE ?? process.env.SUPABASE_PROFILE_TABLE ?? 'profiles',
  appleClientId: process.env.APPLE_CLIENT_ID ?? null,
  appleTeamId: process.env.APPLE_TEAM_ID ?? null,
  appleKeyId: process.env.APPLE_KEY_ID ?? null,
  applePrivateKey: process.env.APPLE_PRIVATE_KEY ?? null,
  appleBundleId: process.env.APPLE_BUNDLE_ID ?? 'io.sseudam.co',
  appleApnsProduction: truthy(process.env.APPLE_APNS_PRODUCTION) ?? undefined,
  appBaseUrl: process.env.APP_BASE_URL ?? 'https://sseudam.up.railway.app',
  appMinSupportedVersion: process.env.APP_MIN_SUPPORTED_VERSION ?? null,
  appForceUpdate: truthy(process.env.APP_FORCE_UPDATE) ?? true,
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? null,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? null,
  // Kakao OAuth
  kakaoClientId: process.env.KAKAO_CLIENT_ID ?? null,
  kakaoClientSecret: process.env.KAKAO_CLIENT_SECRET ?? null,
  kakaoRedirectUri: process.env.KAKAO_REDIRECT_URI ?? null,
  // Redis 설정 (선택적)
  redisUrl: process.env.REDIS_URL ?? process.env.REDIS_URI ?? null,
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? null,
  corsOrigins: (
    process.env.CORS_ALLOWED_ORIGINS ??
    process.env.CORS_ORIGINS ??
    'http://localhost:3000,https://sseudam.up.railway.app'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
  sentryDsn: process.env.SENTRY_DSN ?? null,
  sentryTracesSampleRate: optionalNumber(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1) ?? 0.1,
  sentryProfilesSampleRate: optionalNumber(process.env.SENTRY_PROFILES_SAMPLE_RATE, 0.1) ?? 0.1,
};

const supabaseProjectRef = decodeSupabaseRef(env.supabaseServiceRoleKey);
env.supabaseUrl = normalizeSupabaseUrl(
  process.env.SUPABASE_URL ?? process.env.SUPERBASE_URL ?? '',
  env.supabaseServiceRoleKey,
);
env.supabaseProjectRef = supabaseProjectRef;

export const isProduction = env.nodeEnv === 'production';

if (env.corsOrigins.length === 0) {
  env.corsOrigins.push('http://localhost:3000', 'https://sseudam.up.railway.app');
}

const missingVars: string[] = [];
const supabaseHostLooksValid = env.supabaseUrl.includes('supabase.');
const requiredEnv: Array<[boolean, string]> = [
  [Boolean(env.databaseUrl), 'RAILWAY_DATABASE_URL / DATABASE_URL / SUPABASE_DB_URL'],
  [Boolean(env.jwtSecret), 'JWT_SECRET'],
  [Boolean(env.supabaseServiceRoleKey), 'SUPABASE_SERVICE_ROLE_KEY'],
  [Boolean(env.supabaseUrl), 'SUPABASE_URL'],
];

for (const [isPresent, label] of requiredEnv) {
  if (!isPresent) {
    missingVars.push(label);
  }
}

if (env.supabaseUrl && !supabaseHostLooksValid && !supabaseProjectRef) {
  missingVars.push('Valid SUPABASE_URL (expected https://<project>.supabase.co)');
}

if (missingVars.length > 0) {
  throw new Error(
    `[ENV] Missing required environment variables: ${missingVars.join(', ')}`,
  );
}

if (env.jwtSecret === 'secret') {
  if (isProduction) {
    throw new Error('[ENV] JWT_SECRET must be set in production');
  } else {
    console.warn(
      '[ENV] Using fallback JWT secret. Set JWT_SECRET to a secure value.',
    );
  }
}
