import { promisify } from 'util';
import { lookup } from 'dns';

const dnsLookup = promisify(lookup);

export async function resolveIPv4IfNeeded(hostname: string): Promise<string> {
  // If it's already an IP address, return as-is
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return hostname;
  }

  try {
    const { address } = await dnsLookup(hostname, { family: 4 });
    return address;
  } catch (error) {
    // If DNS resolution fails, return the original hostname
    return hostname;
  }
}

export function shouldUseTLS(hostname: string): boolean {
  // Use TLS for production databases and cloud providers
  const tlsHosts = [
    'localhost',
    '127.0.0.1',
    'postgres',
    '.railway.app',
    '.amazonaws.com',
    '.supabase.co',
    '.planetscale.com',
  ];

  // Don't use TLS for localhost/development
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return false;
  }

  // Use TLS for cloud providers
  return tlsHosts.some(host => hostname.includes(host));
}

export function isPrivateIP(ip: string): boolean {
  const privateRanges = [
    /^127\./,
    /^192\.168\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[0-1])\./,
  ];

  return privateRanges.some(range => range.test(ip));
}

export function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}