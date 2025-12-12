#!/usr/bin/env node
/**
 * Fetch latest version info from the Apple Lookup API and upsert into app_versions.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/update-app-version.js [bundleId] [countryCode]
 *
 * Defaults:
 *   bundleId   = io.sseudam.co
 *   country    = kr
 */

const { Client } = require('pg');

const BUNDLE_ID = process.argv[2] || 'io.sseudam.co';
const COUNTRY = process.argv[3] || 'kr';
const DB_URL = process.env.DATABASE_URL;

if (!DB_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

async function fetchAppStoreData(bundleId, country) {
  const url = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}&country=${encodeURIComponent(country)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'SseudamBackend/1.0.0',
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Lookup failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  if (!json.resultCount || !json.results || !json.results[0]) {
    throw new Error('No results from Apple Lookup API');
  }
  const result = json.results[0];
  return {
    bundleId: result.bundleId || bundleId,
    latestVersion: result.version,
    releaseNotes: result.releaseNotes || null,
    forceUpdate: false,
    lastUpdated: result.currentVersionReleaseDate || null,
    minimumOsVersion: result.minimumOsVersion || null,
    trackName: result.trackName || null,
    appStoreUrl: result.trackViewUrl || null,
  };
}

async function upsertAppVersion(client, meta) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS app_versions (
      bundle_id TEXT PRIMARY KEY,
      latest_version TEXT NOT NULL,
      min_supported_version TEXT,
      force_update BOOLEAN DEFAULT false,
      release_notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await client.query(
    `INSERT INTO app_versions (bundle_id, latest_version, min_supported_version, force_update, release_notes, updated_at)
     VALUES ($1, $2, NULL, $3, $4, $5)
     ON CONFLICT (bundle_id)
     DO UPDATE SET
       latest_version = EXCLUDED.latest_version,
       min_supported_version = COALESCE(EXCLUDED.min_supported_version, app_versions.min_supported_version),
       force_update = EXCLUDED.force_update,
       release_notes = EXCLUDED.release_notes,
       updated_at = EXCLUDED.updated_at`,
    [
      meta.bundleId,
      meta.latestVersion,
      meta.forceUpdate,
      meta.releaseNotes,
      meta.lastUpdated ? new Date(meta.lastUpdated).toISOString() : new Date().toISOString(),
    ],
  );
}

(async () => {
  const client = new Client({ connectionString: DB_URL });
  try {
    console.log(`[version] Fetching from Apple: bundleId=${BUNDLE_ID}, country=${COUNTRY}`);
    const meta = await fetchAppStoreData(BUNDLE_ID, COUNTRY);
    console.log(`[version] Fetched version=${meta.latestVersion}, lastUpdated=${meta.lastUpdated}`);

    await client.connect();
    await upsertAppVersion(client, meta);
    console.log('[version] Upsert complete');
  } catch (err) {
    console.error('[version] Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
})();
