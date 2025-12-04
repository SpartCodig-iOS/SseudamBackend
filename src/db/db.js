import dns from 'node:dns';
import postgres from 'postgres';

// IPv4 우선 사용 (Node 18+)
dns.setDefaultResultOrder('ipv4first');

// DB URL 우선순위: Railway → DATABASE_URL → Supabase aliases
const connectionString =
  process.env.RAILWAY_DATABASE_URL ||
  process.env.DATABASE_URL ||
  process.env.SUPERBASE_DB_URL ||
  process.env.SUPABASE_DB_URL;

if (!connectionString) {
  throw new Error('RAILWAY_DATABASE_URL / DATABASE_URL is not set');
}

// sslmode=require 가 포함된 URL이면 ssl 옵션 없이도 동작함
const sql = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
});

export default sql;
