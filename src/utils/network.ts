import dns from 'node:dns/promises';
import { env, isProduction } from '../config/env';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'db']);

const hostLooksLikeSupabase = (host: string): boolean =>
  host.includes('supabase.co') || host.includes('supabase.com');

const hostLooksLikeRailway = (host: string): boolean =>
  host.includes('railway') || host.includes('rlwy.net') || host.includes('proxy.rlwy.net');

const shouldForceIPv4ViaHost = (host: string): boolean => {
  if (env.databaseForceIPv4) return true;
  return hostLooksLikeSupabase(host);
};

export const resolveIPv4IfNeeded = async (host: string): Promise<string> => {
  if (!host || !shouldForceIPv4ViaHost(host)) {
    return host;
  }

  try {
    const result = await dns.lookup(host, { family: 4, all: false });
    return result?.address ?? host;
  } catch (error) {
    console.warn(`Failed to resolve IPv4 for ${host}:`, error);
    return host;
  }
};

export const shouldUseTLS = (host: string): boolean => {
  if (env.databaseRequireTLS !== null) {
    return Boolean(env.databaseRequireTLS);
  }

  if (!host) return isProduction;
  if (LOCAL_HOSTS.has(host.toLowerCase())) {
    return false;
  }
  if (hostLooksLikeSupabase(host) || hostLooksLikeRailway(host) || host.includes('render.com')) {
    return true;
  }
  return isProduction;
};
