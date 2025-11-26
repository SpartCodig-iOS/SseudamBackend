"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isProduction = exports.env = void 0;
require("dotenv/config");
const truthy = (value) => {
    if (!value)
        return false;
    return ['1', 'true', 'yes', 'y', 'on'].includes(value.toLowerCase());
};
const optionalNumber = (value, fallback) => {
    if (!value)
        return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const databaseUrl = process.env.SUPERBASE_DB_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL?.trim();
exports.env = {
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
    refreshTokenTTL: optionalNumber(process.env.REFRESH_TOKEN_TTL_SECONDS, 60 * 60 * 24 * 60) ?? 60 * 60 * 24 * 60,
    supabaseUrl: process.env.SUPABASE_URL ?? process.env.SUPERBASE_URL ?? '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ??
        process.env.SUPERBASE_SERVICE_ROLE_KEY ??
        process.env.SUPERBASE_ANON_KEY ??
        process.env.SUPABASE_ANON_KEY ??
        '',
    supabaseProfileTable: process.env.SUPERBASE_PROFILE_TABLE ?? process.env.SUPABASE_PROFILE_TABLE ?? 'profiles',
    appleClientId: process.env.APPLE_CLIENT_ID ?? null,
    appleTeamId: process.env.APPLE_TEAM_ID ?? null,
    appleKeyId: process.env.APPLE_KEY_ID ?? null,
    applePrivateKey: process.env.APPLE_PRIVATE_KEY ?? null,
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? null,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? null,
    // Redis 설정 (선택적)
    redisUrl: process.env.REDIS_URL ?? process.env.REDIS_URI ?? null,
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? null,
    corsOrigins: (process.env.CORS_ALLOWED_ORIGINS ??
        process.env.CORS_ORIGINS ??
        'http://localhost:3000,https://sseudam.up.railway.app')
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    sentryDsn: process.env.SENTRY_DSN ?? null,
    sentryTracesSampleRate: optionalNumber(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1) ?? 0.1,
    sentryProfilesSampleRate: optionalNumber(process.env.SENTRY_PROFILES_SAMPLE_RATE, 0.1) ?? 0.1,
};
exports.isProduction = exports.env.nodeEnv === 'production';
if (exports.env.corsOrigins.length === 0) {
    exports.env.corsOrigins.push('http://localhost:3000', 'https://sseudam.up.railway.app');
}
const missingVars = [];
const requiredEnv = [
    ['databaseUrl', 'DATABASE_URL / SUPABASE_DB_URL'],
    ['jwtSecret', 'JWT_SECRET'],
    ['supabaseUrl', 'SUPABASE_URL'],
    ['supabaseServiceRoleKey', 'SUPABASE_SERVICE_ROLE_KEY'],
];
for (const [key, label] of requiredEnv) {
    if (!exports.env[key]) {
        missingVars.push(label);
    }
}
if (missingVars.length > 0) {
    throw new Error(`[ENV] Missing required environment variables: ${missingVars.join(', ')}`);
}
if (exports.env.jwtSecret === 'secret') {
    if (exports.isProduction) {
        throw new Error('[ENV] JWT_SECRET must be set in production');
    }
    else {
        console.warn('[ENV] Using fallback JWT secret. Set JWT_SECRET to a secure value.');
    }
}
