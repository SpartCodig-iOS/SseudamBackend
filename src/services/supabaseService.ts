import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { LoginType } from '../types/auth';
import { env } from '../config/env';

@Injectable()
export class SupabaseService {
  private client: SupabaseClient | null = null;

  constructor() {
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
    client?: SupabaseClient,
  ): Promise<string> {
    const supabase = client ?? this.getClient();
    const normalizedBase = this.normalizeUsername(base, userId);
    let candidate = normalizedBase;
    let attempts = 0;

    while (attempts < 10) {
      const { data, error } = await supabase
        .from(env.supabaseProfileTable)
        .select('id')
        .eq('username', candidate)
        .limit(1);

      if (error) {
        throw error;
      }

      const existingId = data?.[0]?.id as string | undefined;
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
    const client = this.getClient();
    const { data, error } = await client
      .from(env.supabaseProfileTable)
      .select('id, email, username, name, login_type, avatar_url')
      .eq('id', id)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  }

  // 배치로 여러 프로필 조회 (성능 최적화)
  async findProfilesByIds(ids: string[]) {
    if (ids.length === 0) return [];

    // 중복 ID 제거
    const uniqueIds = Array.from(new Set(ids));

    // 배치 크기 제한 (PostgreSQL의 IN 절 최대 한계 고려)
    const BATCH_SIZE = 1000;
    const results = [];

    for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
      const batch = uniqueIds.slice(i, i + BATCH_SIZE);

      const client = this.getClient();
      const { data, error } = await client
        .from(env.supabaseProfileTable)
        .select('id, email, username, name, login_type, avatar_url, created_at, updated_at')
        .in('id', batch)
        .order('username'); // 정렬로 인덱스 활용

      if (error) {
        throw error;
      }

      if (data) {
        results.push(...data);
      }
    }

    // 원본 순서 유지를 위한 맵 생성
    const profileMap = new Map(results.map(profile => [profile.id, profile]));
    return ids.map(id => profileMap.get(id)).filter(Boolean);
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
    const client = this.getClient();
    const now = new Date().toISOString();
    const payload = {
      id: params.id,
      email: params.email,
      name: params.name,
      username: params.username,
      login_type: params.loginType ?? null,
      avatar_url: params.avatarUrl ?? null,
      created_at: now,
      updated_at: now,
    };
    const { error } = await client.from(env.supabaseProfileTable).upsert(payload, { onConflict: 'id' });
    if (error) throw error;
  }

  async ensureProfileFromSupabaseUser(user: User, loginType: LoginType) {
    if (!user.email) {
      throw new Error('Supabase user does not contain an email');
    }
    const client = this.getClient();
    const { data: existingProfile, error: existingProfileError } = await client
      .from(env.supabaseProfileTable)
      .select('username')
      .eq('id', user.id)
      .limit(1)
      .maybeSingle();
    if (existingProfileError) {
      throw existingProfileError;
    }
    const existingProfileUsername =
      (existingProfile?.username as string | undefined) ?? null;

    const proposedUsername =
      (user.user_metadata?.username as string | undefined) ??
      user.email.split('@')[0] ??
      user.id;
    const username =
      existingProfileUsername ??
      (await this.ensureUniqueUsername(proposedUsername, user.id, client));

    const metadata = user.user_metadata ?? {};
    const displayName = (metadata.display_name as string | null) ?? null;
    const standardName =
      (metadata.name as string | null) ??
      (metadata.full_name as string | null) ??
      null;
    const shouldUseDisplayName = loginType !== 'email' && loginType !== 'username';
    const resolvedName = shouldUseDisplayName ? displayName ?? standardName : standardName ?? displayName;

    // 소셜 로그인에서 아바타 URL 추출
    const avatarUrl =
      (metadata.avatar_url as string | null) ??
      (metadata.picture as string | null) ??
      (metadata.photo as string | null) ??
      null;

    await this.upsertProfile({
      id: user.id,
      email: user.email,
      name: resolvedName,
      username,
      loginType,
      avatarUrl,
    });
  }

  async saveAppleRefreshToken(userId: string, refreshToken: string | null) {
    const client = this.getClient();
    const { error } = await client
      .from(env.supabaseProfileTable)
      .update({
        apple_refresh_token: refreshToken,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
    if (error) {
      throw new Error(`[saveAppleRefreshToken] update failed: ${error.message}`);
    }
  }

  async getAppleRefreshToken(userId: string): Promise<string | null> {
    const client = this.getClient();
    const { data, error } = await client
      .from(env.supabaseProfileTable)
      .select('apple_refresh_token')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      throw new Error(`[getAppleRefreshToken] select failed: ${error.message}`);
    }
    return (data?.apple_refresh_token as string | null) ?? null;
  }

  async saveGoogleRefreshToken(userId: string, refreshToken: string | null) {
    const client = this.getClient();
    const { error } = await client
      .from(env.supabaseProfileTable)
      .update({
        google_refresh_token: refreshToken,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
    if (error) {
      throw new Error(`[saveGoogleRefreshToken] update failed: ${error.message}`);
    }
  }

  async getGoogleRefreshToken(userId: string): Promise<string | null> {
    const client = this.getClient();
    const { data, error } = await client
      .from(env.supabaseProfileTable)
      .select('google_refresh_token')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      throw new Error(`[getGoogleRefreshToken] select failed: ${error.message}`);
    }
    return (data?.google_refresh_token as string | null) ?? null;
  }

  private parseAvatarStoragePath(avatarUrl?: string | null): { bucket: string; path: string } | null {
    if (!avatarUrl) return null;
    const trimmed = avatarUrl.trim();
    if (!trimmed) return null;

    const bucket = 'profileimages';
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
    const client = this.getClient();

    const { data: userLookup, error: lookupError } = await client.auth.admin.getUserById(id);
    if (lookupError) {
      throw new Error(`[deleteUser] admin.getUserById failed: ${lookupError.message}`);
    }
    if (!userLookup?.user) {
      await client.from(env.supabaseProfileTable).delete().eq('id', id);
      return;
    }

    const { error: profileError } = await client.from(env.supabaseProfileTable).delete().eq('id', id);
    if (profileError) {
      throw new Error(`[deleteUser] profile delete failed: ${profileError.message}`);
    }

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
    if (!this.client) {
      return 'not_configured';
    }

    try {
      const { error } = await this.client
        .from(env.supabaseProfileTable)
        .select('id', { head: true, count: 'exact' });

      if (error) {
        console.error('[health] Supabase health check error', error);
        return 'unavailable';
      }
      return 'ok';
    } catch (error) {
      console.error('[health] Supabase health check exception', error);
      return 'unavailable';
    }
  }

}
