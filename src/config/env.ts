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

const databaseUrl =
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
  databaseForceIPv4: truthy(process.env.DATABASE_FORCE_IPV4) ?? false,
  jwtSecret: process.env.JWT_SECRET ?? 'secret',
  accessTokenTTL: optionalNumber(process.env.ACCESS_TOKEN_TTL_SECONDS, 60 * 60 * 24) ?? 60 * 60 * 24,
  refreshTokenTTL: optionalNumber(process.env.REFRESH_TOKEN_TTL_SECONDS, 60 * 60 * 24 * 7) ?? 60 * 60 * 24 * 7,
  supabaseUrl: process.env.SUPABASE_URL ?? process.env.SUPERBASE_URL ?? '',
  supabaseServiceRoleKey:
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPERBASE_SERVICE_ROLE_KEY ??
    process.env.SUPERBASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    '',
  supabaseProfileTable:
    process.env.SUPERBASE_PROFILE_TABLE ?? process.env.SUPABASE_PROFILE_TABLE ?? 'profiles',
  appleClientId: process.env.APPLE_CLIENT_ID ?? null,
  appleTeamId: process.env.APPLE_TEAM_ID ?? null,
  appleKeyId: process.env.APPLE_KEY_ID ?? null,
  applePrivateKey: process.env.APPLE_PRIVATE_KEY ?? null,
};

export const isProduction = env.nodeEnv === 'production';
