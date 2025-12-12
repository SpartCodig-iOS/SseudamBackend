import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { LoginType } from '../types/auth';
import { env } from '../config/env';
import { getPool } from '../db/pool';
import { OAuthTokenService } from './oauth-token.service';

@Injectable()
export class SupabaseService {
  private client: SupabaseClient | null = null;
  private readonly logger = new Logger(SupabaseService.name);
  private readonly avatarBucket = 'profileimages';
  private avatarBucketEnsured = false;
  private readonly avatarMirrorPromises = new Map<string, Promise<string | null>>();

  constructor(
    private readonly oauthTokenService: OAuthTokenService,
  ) {
    if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
      console.warn(
        '[SupabaseService] SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되어 있지 않습니다.',
      );
      return;
    }

    this.client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  private getIdentityData(user: User): Record<string, any>[] {
    return (user.identities ?? [])
      .map((identity) => identity.identity_data as Record<string, any> | undefined)
      .filter((data): data is Record<string, any> => Boolean(data));
  }

  private resolveNameFromUser(user: User, loginType: LoginType): string | null {
    const metadata = user.user_metadata ?? {};
    const raw = (user as any)?.raw_user_meta_data ?? {};
    const identityDataList = this.getIdentityData(user);

    const displayNameFromMetadata =
      (metadata.display_name as string | undefined) ??
      (metadata.full_name as string | undefined) ??
      (raw.display_name as string | undefined) ??
      (raw.full_name as string | undefined) ??
      (raw.name as string | undefined) ??
      null;

    const nameFromMetadata =
      (metadata.name as string | undefined) ??
      (metadata.full_name as string | undefined) ??
      (raw.name as string | undefined) ??
      (raw.full_name as string | undefined) ??
      (raw.display_name as string | undefined) ??
      null;

    const identityName = identityDataList
      .map((data) =>
        (data.full_name as string | undefined) ??
        (data.name as string | undefined) ??
        (data.given_name as string | undefined) ??
        null,
      )
      .find((value) => Boolean(value)) ?? null;

    const shouldPreferDisplay = loginType !== 'email' && loginType !== 'username';

    const displayCandidate = displayNameFromMetadata ?? identityName;
    const nameCandidate = nameFromMetadata ?? identityName;

    return shouldPreferDisplay ? displayCandidate ?? nameCandidate : nameCandidate ?? displayCandidate;
  }

  public resolveAvatarFromUser(user: User): string | null {
    const metadata = user.user_metadata ?? {};
    const raw = (user as any)?.raw_user_meta_data ?? {};
    const identityDataList = this.getIdentityData(user);

    const avatarFromMetadata =
      (metadata.avatar_url as string | undefined) ??
      (metadata.picture as string | undefined) ??
      (metadata.photo as string | undefined) ??
      (raw.avatar_url as string | undefined) ??
      (raw.picture as string | undefined) ??
      (raw.photo as string | undefined) ??
      null;

    const avatarFromIdentity = identityDataList
      .map((data) =>
        (data.avatar_url as string | undefined) ??
        (data.picture as string | undefined) ??
        (data.photo as string | undefined) ??
        null,
      )
      .find((value) => Boolean(value)) ?? null;

    return avatarFromMetadata ?? avatarFromIdentity ?? null;
  }

  isConfigured(): boolean {
    return Boolean(this.client);
  }

  private getClient(): SupabaseClient {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Supabase admin client is not configured (missing env vars)',
      );
    }
    return this.client;
  }

  private normalizeUsername(base: string, userId: string): string {
    const cleaned = base
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24);
    if (cleaned.length >= 3) {
      return cleaned;
    }
    return `user_${userId.replace(/[^a-z0-9]/gi, '').slice(0, 12) || userId.slice(0, 12)}`;
  }

  private async ensureUniqueUsername(
    base: string,
    userId: string,
  ): Promise<string> {
    const normalizedBase = this.normalizeUsername(base, userId);
    let candidate = normalizedBase;
    let attempts = 0;

    while (attempts < 10) {
      const pool = await getPool();
      const result = await pool.query(
        `SELECT id FROM ${env.supabaseProfileTable} WHERE username = $1 LIMIT 1`,
        [candidate],
      );

      const existingId = result.rows[0]?.id as string | undefined;
      if (!existingId || existingId === userId) {
        return candidate;
      }

      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      candidate = `${normalizedBase}_${randomSuffix}`.slice(0, 32);
      attempts += 1;
    }

    return `${normalizedBase}_${Date.now().toString(36)}`.slice(0, 32);
  }

  async signUp(email: string, password: string, metadata: Record<string, string | undefined>) {
    const client = this.getClient();
    const { data, error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) throw error;
    return data.user;
  }

  async signIn(email: string, password: string): Promise<User> {
    const client = this.getClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.user) {
      throw new ServiceUnavailableException('Supabase signIn returned no user');
    }
    return data.user;
  }

  async getUserFromToken(token: string) {
    const client = this.getClient();
    const { data, error } = await client.auth.getUser(token);
    if (error) throw error;
    return data.user;
  }

  async getUserById(id: string) {
    const client = this.getClient();
    const { data, error } = await client.auth.admin.getUserById(id);
    if (error) throw error;
    return data.user;
  }

  async findProfileById(id: string) {
    const pool = await getPool();
    const result = await pool.query(
      `SELECT id::text, email, username, name, login_type, avatar_url, role, created_at, updated_at
       FROM ${env.supabaseProfileTable}
       WHERE id = $1
       LIMIT 1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id as string,
      email: row.email as string,
      username: row.username as string,
      name: (row.name as string | null) ?? null,
      login_type: (row.login_type as string | null) ?? null,
      avatar_url: (row.avatar_url as string | null) ?? null,
      role: (row.role as string | null) ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  // 배치로 여러 프로필 조회 (성능 최적화)
  async findProfilesByIds(ids: string[]) {
    if (ids.length === 0) return [];

    const uniqueIds = Array.from(new Set(ids));
    const pool = await getPool();
    const result = await pool.query(
      `SELECT id::text, email, username, name, login_type, avatar_url, role, created_at, updated_at
       FROM ${env.supabaseProfileTable}
       WHERE id = ANY($1::uuid[])`,
      [uniqueIds],
    );
    const profileMap = new Map(result.rows.map((profile) => [profile.id, profile]));
    return ids.map((id) => profileMap.get(id)).filter(Boolean);
  }

  // 프로필 캐시를 위한 새로운 메서드
  async findProfilesByIdsWithCache(ids: string[], cacheService?: any): Promise<any[]> {
    if (ids.length === 0) return [];

    const uniqueIds = Array.from(new Set(ids));
    const profiles = [];
    const uncachedIds = [];

    // 캐시에서 먼저 조회
    if (cacheService) {
      for (const id of uniqueIds) {
        const cached = await cacheService.get(`profile:${id}`, { ttl: 300 }); // 5분 캐시
        if (cached) {
          profiles.push(cached);
        } else {
          uncachedIds.push(id);
        }
      }
    } else {
      uncachedIds.push(...uniqueIds);
    }

    // 캐시되지 않은 프로필들을 배치로 조회
    if (uncachedIds.length > 0) {
      const uncachedProfiles = await this.findProfilesByIds(uncachedIds);

      // 조회한 프로필들을 캐시에 저장
      if (cacheService) {
        const cachePromises = uncachedProfiles.map(profile =>
          cacheService.set(`profile:${profile?.id}`, profile, { ttl: 300 })
        );
        await Promise.allSettled(cachePromises); // 캐시 실패가 메인 로직에 영향 안 줌
      }

      profiles.push(...uncachedProfiles);
    }

    // 원본 순서 유지
    const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
    return ids.map(id => profileMap.get(id)).filter(Boolean);
  }

  async upsertProfile(params: {
    id: string;
    email: string;
    name?: string | null;
    username: string;
    loginType?: LoginType;
    avatarUrl?: string | null;
  }) {
    const pool = await getPool();
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO ${env.supabaseProfileTable}
         (id, email, name, username, login_type, avatar_url, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email,
           name = EXCLUDED.name,
           username = EXCLUDED.username,
           login_type = EXCLUDED.login_type,
           avatar_url = EXCLUDED.avatar_url,
           updated_at = EXCLUDED.updated_at`,
      [
        params.id,
        params.email,
        params.name ?? null,
        params.username,
        params.loginType ?? null,
        params.avatarUrl ?? null,
        now,
      ],
    );
  }

  async ensureProfileFromSupabaseUser(user: User, loginType: LoginType) {
    if (!user.email) {
      throw new Error('Supabase user does not contain an email');
    }
    const pool = await getPool();
    const existingProfileResult = await pool.query(
      `SELECT username, name, avatar_url
       FROM ${env.supabaseProfileTable}
       WHERE id = $1
       LIMIT 1`,
      [user.id],
    );
    const existingProfile = existingProfileResult.rows[0];
    const existingProfileUsername = (existingProfile?.username as string | undefined) ?? null;
    const existingProfileName = (existingProfile?.name as string | undefined) ?? null;
    const existingAvatar = (existingProfile?.avatar_url as string | undefined) ?? null;

    const proposedUsername =
      (user.user_metadata?.username as string | undefined) ??
      user.email.split('@')[0] ??
      user.id;
    const username =
      existingProfileUsername ??
      (await this.ensureUniqueUsername(proposedUsername, user.id));

    const resolvedName =
      this.resolveNameFromUser(user, loginType) ??
      existingProfileName ??
      user.email?.split('@')[0] ??
      user.id;

    // 소셜 로그인에서 아바타 URL 추출 (identity 데이터 포함)
    const avatarUrl = this.resolveAvatarFromUser(user) ?? existingAvatar ?? null;

    await this.upsertProfile({
      id: user.id,
      email: user.email,
      name: resolvedName,
      username,
      loginType,
      avatarUrl,
    });

    // Google 등에서 제공한 외부 URL이 있고, 프로필에 저장된 파일이 아니라면 비동기 업로드
    if (
      avatarUrl &&
      !this.parseAvatarStoragePath(avatarUrl) &&
      (!existingAvatar || !this.parseAvatarStoragePath(existingAvatar))
    ) {
      void this.ensureProfileAvatar(user.id, avatarUrl).catch((error) => {
        this.logger.debug(`[ensureProfileFromSupabaseUser] Mirror avatar failed: ${error instanceof Error ? error.message : 'unknown'}`);
      });
    }
  }

  async saveAppleRefreshToken(userId: string, refreshToken: string | null) {
    await this.oauthTokenService.saveToken(userId, 'apple', refreshToken);
  }

  async getAppleRefreshToken(userId: string): Promise<string | null> {
    return this.oauthTokenService.getToken(userId, 'apple');
  }

  async saveGoogleRefreshToken(userId: string, refreshToken: string | null) {
    await this.oauthTokenService.saveToken(userId, 'google', refreshToken);
  }

  async getGoogleRefreshToken(userId: string): Promise<string | null> {
    return this.oauthTokenService.getToken(userId, 'google');
  }

  public parseAvatarStoragePath(avatarUrl?: string | null): { bucket: string; path: string } | null {
    if (!avatarUrl) return null;
    const trimmed = avatarUrl.trim();
    if (!trimmed) return null;

    const bucket = this.avatarBucket;
    const normalizedBase = env.supabaseUrl.replace(/\/$/, '');
    const publicPrefix = `${normalizedBase}/storage/v1/object/public/${bucket}/`;

    if (trimmed.startsWith(publicPrefix)) {
      const path = trimmed.slice(publicPrefix.length);
      return path ? { bucket, path } : null;
    }

    if (trimmed.startsWith(`${bucket}/`)) {
      const path = trimmed.slice(bucket.length + 1);
      return path ? { bucket, path } : null;
    }

    return null;
  }

  private buildAvatarPublicUrl(pathInfo: { bucket: string; path: string }): string {
    const base = env.supabaseUrl.replace(/\/$/, '');
    return `${base}/storage/v1/object/public/${pathInfo.bucket}/${pathInfo.path}`;
  }

  async storageAvatarExists(avatarUrl?: string | null): Promise<boolean> {
    const pathInfo = this.parseAvatarStoragePath(avatarUrl);
    if (!pathInfo) return false;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    try {
      const response = await fetch(this.buildAvatarPublicUrl(pathInfo), {
        method: 'HEAD',
        signal: controller.signal,
      });
      // 존재가 확실히 없을 때(404)만 false, 그 외(429/5xx/timeout)는 true로 취급해 불필요한 제거를 막음
      if (response.status === 404) return false;
      return true;
    } catch {
      // 네트워크/타임아웃 시에는 보수적으로 존재한다고 간주해 캐시된 URL을 지우지 않음
      return true;
    } finally {
      clearTimeout(timeout);
    }
  }

  async clearAvatarUrl(userId: string): Promise<void> {
    const pool = await getPool();
    await pool.query(
      `UPDATE ${env.supabaseProfileTable}
         SET avatar_url = NULL,
             updated_at = NOW()
       WHERE id = $1`,
      [userId],
    );
  }

  private detectImageKind(url: string, contentType?: string | null): 'png' | 'jpeg' | null {
    const type = (contentType ?? '').toLowerCase();
    if (type.includes('png')) return 'png';
    if (type.includes('jpeg') || type.includes('jpg')) return 'jpeg';

    const normalized = (url.split('?')[0] ?? '').toLowerCase();
    const extFromUrl = normalized.split('.').pop() ?? '';
    const cleanExt = extFromUrl.replace(/[^a-z0-9]/g, '');
    if (cleanExt === 'png') return 'png';
    if (cleanExt === 'jpg' || cleanExt === 'jpeg') return 'jpeg';

    return null;
  }

  private async ensureAvatarBucket(): Promise<void> {
    if (this.avatarBucketEnsured) return;
    const client = this.getClient();
    const { data, error } = await client.storage.getBucket(this.avatarBucket);
    if (error && !error.message.toLowerCase().includes('not found')) {
      throw error;
    }
    if (!data) {
      const { error: createError } = await client.storage.createBucket(this.avatarBucket, { public: true });
      if (createError) {
        throw createError;
      }
    } else if (!data.public) {
      const { error: updateError } = await client.storage.updateBucket(this.avatarBucket, { public: true });
      if (updateError) {
        throw updateError;
      }
    }
    this.avatarBucketEnsured = true;
  }

  async mirrorProfileAvatar(userId: string, sourceUrl?: string | null): Promise<string | null> {
    if (!sourceUrl) return null;
    const trimmedUrl = sourceUrl.trim();
    if (!trimmedUrl) return null;

    // 이미 스토리지 경로면 그대로 사용
    const existingPath = this.parseAvatarStoragePath(trimmedUrl);
    if (existingPath) {
      return trimmedUrl;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(trimmedUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        // 원본 URL만 저장하고 종료 (기본 이미지 등 접근 불가)
        const pool = await getPool();
        await pool.query(
          `UPDATE ${env.supabaseProfileTable}
             SET avatar_url = $1,
                 updated_at = NOW()
           WHERE id = $2`,
          [trimmedUrl, userId],
        );
        return trimmedUrl;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = response.headers.get('content-type') ?? undefined;
      const kind = this.detectImageKind(trimmedUrl, contentType);

      // png/jpeg 외 포맷은 건너뛰고 기존 URL 유지
      if (!kind) {
        this.logger.warn(`[mirrorProfileAvatar] Skip unsupported image type for user ${userId} (${contentType ?? 'unknown'})`);
        const pool = await getPool();
        await pool.query(
          `UPDATE ${env.supabaseProfileTable}
             SET avatar_url = $1,
                 updated_at = NOW()
           WHERE id = $2`,
          [trimmedUrl, userId],
        );
        return trimmedUrl;
      }

      const ext = kind === 'png' ? 'png' : 'jpeg';
      const resolvedContentType = kind === 'png' ? 'image/png' : 'image/jpeg';
      const objectPath = `${userId}/${randomUUID()}.${ext}`;

      const client = this.getClient();
      await this.ensureAvatarBucket();
      const upload = async () => client.storage.from(this.avatarBucket).upload(objectPath, buffer, {
        contentType: resolvedContentType,
        upsert: true,
      });
      let { error } = await upload();
      if (error && error.message.toLowerCase().includes('bucket not found')) {
        this.avatarBucketEnsured = false;
        await this.ensureAvatarBucket();
        ({ error } = await upload());
      }
      if (error) {
        throw new Error(`upload failed: ${error.message}`);
      }

      const publicUrl = `${env.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${this.avatarBucket}/${objectPath}`;
      const pool = await getPool();
      await pool.query(
        `UPDATE ${env.supabaseProfileTable}
           SET avatar_url = $1,
               updated_at = NOW()
         WHERE id = $2`,
        [publicUrl, userId],
      );

      return publicUrl;
    } catch (error) {
      this.logger.warn(`[mirrorProfileAvatar] Failed for user ${userId} from ${trimmedUrl}`, error as Error);
      try {
        const pool = await getPool();
        await pool.query(
          `UPDATE ${env.supabaseProfileTable}
             SET avatar_url = $1,
                 updated_at = NOW()
           WHERE id = $2`,
          [trimmedUrl, userId],
        );
      } catch {
        // ignore
      }
      return trimmedUrl;
    }
  }

  /**
   * 아바타가 스토리지에 없으면 다운로드 후 업로드해 영속화. 병렬 중복은 dedupe.
   */
  async ensureProfileAvatar(userId: string, avatarUrl?: string | null): Promise<string | null> {
    if (!avatarUrl) return null;

    // 이미 Supabase 스토리지 경로면 그대로 사용
    if (this.parseAvatarStoragePath(avatarUrl)) {
      return avatarUrl;
    }

    const key = `${userId}:${avatarUrl}`;
    const inFlight = this.avatarMirrorPromises.get(key);
    if (inFlight) return inFlight;

    const promise = this.mirrorProfileAvatar(userId, avatarUrl)
      .catch((error) => {
        this.logger.warn(`[ensureProfileAvatar] mirror failed for ${userId}`, error as Error);
        return null;
      })
      .finally(() => this.avatarMirrorPromises.delete(key));

    this.avatarMirrorPromises.set(key, promise);
    return promise;
  }

  async deleteProfileImage(avatarUrl?: string | null): Promise<void> {
    const pathInfo = this.parseAvatarStoragePath(avatarUrl);
    if (!pathInfo) {
      return;
    }

    const client = this.getClient();
    const { error } = await client.storage.from(pathInfo.bucket).remove([pathInfo.path]);
    if (error) {
      throw new Error(`[deleteProfileImage] remove failed: ${error.message}`);
    }
  }

  async deleteUser(id: string) {
    // DB 레코드 정리
    const pool = await getPool();
    await pool.query(`DELETE FROM ${env.supabaseProfileTable} WHERE id = $1`, [id]);

    // Supabase auth 사용자 삭제(스토리지/인증만 사용)
    const client = this.getClient();
    const { error: userError } = await client.auth.admin.deleteUser(id);
    if (userError) {
      throw new Error(`[deleteUser] admin.deleteUser failed: ${userError.message}`);
    }
  }

  async deleteUserByToken(token: string) {
    const client = this.getClient();

    const { data, error } = await client.auth.getUser(token);
    if (error) {
      throw new Error(`[deleteUserByToken] getUser failed: ${error.message}`);
    }
    const userId = data.user?.id;
    if (!userId) {
      throw new Error('[deleteUserByToken] No user found for provided token');
    }

    await this.deleteUser(userId);
  }

  async checkProfilesHealth(): Promise<'ok' | 'unavailable' | 'not_configured'> {
    try {
      const pool = await getPool();
      await pool.query(`SELECT 1 FROM ${env.supabaseProfileTable} LIMIT 1`);
      return 'ok';
    } catch (error) {
      console.error('[health] Profile table health check failed', error);
      return 'unavailable';
    }
  }

}
