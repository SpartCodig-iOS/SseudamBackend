import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';

let cachedClient: SupabaseClient | null = null;

const getClient = (): SupabaseClient => {
  if (cachedClient) {
    return cachedClient;
  }
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error('Supabase credentials are not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  cachedClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return cachedClient;
};

export const supabaseService = {
  async signUp(email: string, password: string, metadata: Record<string, string>) {
    const client = getClient();
    const { data, error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) throw error;
    return data.user;
  },

  async signIn(email: string, password: string) {
    const client = getClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session;
  },

  async getUserFromToken(token: string) {
    const client = getClient();
    const { data, error } = await client.auth.getUser(token);
    if (error) throw error;
    return data.user;
  },

  async upsertProfile(params: { id: string; email: string; name?: string | null; username: string }) {
    const client = getClient();
    const now = new Date().toISOString();
    const payload = {
      id: params.id,
      email: params.email,
      name: params.name,
      username: params.username,
      created_at: now,
      updated_at: now,
    };
    const { error } = await client
      .from(env.supabaseProfileTable)
      .upsert(payload, { onConflict: 'id' });
    if (error) throw error;
  },

  async deleteUser(id: string) {
    const client = getClient();

    // 0) Validate the user exists (clear error if not)
    const { data: userLookup, error: lookupError } = await client.auth.admin.getUserById(id);
    if (lookupError) {
      throw new Error(`[deleteUser] admin.getUserById failed: ${lookupError.message}`);
    }
    if (!userLookup?.user) {
      // No such user in Auth: best-effort cleanup of profile row, then return
      await client.from(env.supabaseProfileTable).delete().eq('id', id);
      return;
    }

    // 1) Delete from profiles (and other user-owned tables, if any) first
    const { error: profileError } = await client
      .from(env.supabaseProfileTable)
      .delete()
      .eq('id', id);
    if (profileError) {
      throw new Error(`[deleteUser] profile delete failed: ${profileError.message}`);
    }

    // 2) Finally, delete the Auth user via Admin API
    const { error: userError } = await client.auth.admin.deleteUser(id);
    if (userError) {
      throw new Error(`[deleteUser] admin.deleteUser failed: ${userError.message}`);
    }
  },

  async deleteUserByToken(token: string) {
    const client = getClient();

    // getUser with JWT (server-side) to resolve the user id
    const { data, error } = await client.auth.getUser(token);
    if (error) {
      throw new Error(`[deleteUserByToken] getUser failed: ${error.message}`);
    }
    const userId = data.user?.id;
    if (!userId) {
      throw new Error('[deleteUserByToken] No user found for provided token');
    }

    // Reuse the hard-delete path
    await this.deleteUser(userId);
  },
};
