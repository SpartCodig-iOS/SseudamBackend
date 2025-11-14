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

  async findProfileByIdentifier(identifier: string) {
    const client = this.getClient();
    const { data, error } = await client
      .from(env.supabaseProfileTable)
      .select('email, username')
      .or(`username.eq.${identifier},email.ilike.${identifier}@%`)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  }

  async findProfileById(id: string) {
    const client = this.getClient();
    const { data, error } = await client
      .from(env.supabaseProfileTable)
      .select('id, email, username, name, login_type')
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

    const client = this.getClient();
    const { data, error } = await client
      .from(env.supabaseProfileTable)
      .select('id, email, username, name, login_type')
      .in('id', ids);

    if (error) {
      throw error;
    }

    return data || [];
  }

  async upsertProfile(params: {
    id: string;
    email: string;
    name?: string | null;
    username: string;
    loginType?: LoginType;
  }) {
    const client = this.getClient();
    const now = new Date().toISOString();
    const payload = {
      id: params.id,
      email: params.email,
      name: params.name,
      username: params.username,
      login_type: params.loginType ?? null,
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
    const username =
      (user.user_metadata?.username as string | undefined) ??
      user.email.split('@')[0] ??
      user.id;

    const metadata = user.user_metadata ?? {};
    const displayName = (metadata.display_name as string | null) ?? null;
    const standardName =
      (metadata.name as string | null) ??
      (metadata.full_name as string | null) ??
      null;
    const shouldUseDisplayName = loginType !== 'email' && loginType !== 'username';
    const resolvedName = shouldUseDisplayName ? displayName ?? standardName : standardName ?? displayName;

    await this.upsertProfile({
      id: user.id,
      email: user.email,
      name: resolvedName,
      username,
      loginType,
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
