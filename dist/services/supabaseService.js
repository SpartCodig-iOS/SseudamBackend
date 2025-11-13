"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseService = void 0;
const common_1 = require("@nestjs/common");
const supabase_js_1 = require("@supabase/supabase-js");
const env_1 = require("../config/env");
let SupabaseService = class SupabaseService {
    constructor() {
        this.client = null;
        if (!env_1.env.supabaseUrl || !env_1.env.supabaseServiceRoleKey) {
            console.warn('[SupabaseService] SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되어 있지 않습니다.');
            return;
        }
        this.client = (0, supabase_js_1.createClient)(env_1.env.supabaseUrl, env_1.env.supabaseServiceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });
    }
    isConfigured() {
        return Boolean(this.client);
    }
    getClient() {
        if (!this.client) {
            throw new common_1.ServiceUnavailableException('Supabase admin client is not configured (missing env vars)');
        }
        return this.client;
    }
    async signUp(email, password, metadata) {
        const client = this.getClient();
        const { data, error } = await client.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: metadata,
        });
        if (error)
            throw error;
        return data.user;
    }
    async signIn(email, password) {
        const client = this.getClient();
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error)
            throw error;
        if (!data.user) {
            throw new common_1.ServiceUnavailableException('Supabase signIn returned no user');
        }
        return data.user;
    }
    async getUserFromToken(token) {
        const client = this.getClient();
        const { data, error } = await client.auth.getUser(token);
        if (error)
            throw error;
        return data.user;
    }
    async getUserById(id) {
        const client = this.getClient();
        const { data, error } = await client.auth.admin.getUserById(id);
        if (error)
            throw error;
        return data.user;
    }
    async findProfileByIdentifier(identifier) {
        const client = this.getClient();
        const { data, error } = await client
            .from(env_1.env.supabaseProfileTable)
            .select('email, username')
            .or(`username.eq.${identifier},email.ilike.${identifier}@%`)
            .maybeSingle();
        if (error) {
            throw error;
        }
        return data;
    }
    async findProfileById(id) {
        const client = this.getClient();
        const { data, error } = await client
            .from(env_1.env.supabaseProfileTable)
            .select('id, email, username, name, login_type')
            .eq('id', id)
            .maybeSingle();
        if (error) {
            throw error;
        }
        return data;
    }
    async upsertProfile(params) {
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
        const { error } = await client.from(env_1.env.supabaseProfileTable).upsert(payload, { onConflict: 'id' });
        if (error)
            throw error;
    }
    async ensureProfileFromSupabaseUser(user, loginType) {
        if (!user.email) {
            throw new Error('Supabase user does not contain an email');
        }
        const username = user.user_metadata?.username ??
            user.email.split('@')[0] ??
            user.id;
        const metadata = user.user_metadata ?? {};
        const displayName = metadata.display_name ?? null;
        const standardName = metadata.name ??
            metadata.full_name ??
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
    async saveAppleRefreshToken(userId, refreshToken) {
        const client = this.getClient();
        const { error } = await client
            .from(env_1.env.supabaseProfileTable)
            .update({
            apple_refresh_token: refreshToken,
            updated_at: new Date().toISOString(),
        })
            .eq('id', userId);
        if (error) {
            throw new Error(`[saveAppleRefreshToken] update failed: ${error.message}`);
        }
    }
    async getAppleRefreshToken(userId) {
        const client = this.getClient();
        const { data, error } = await client
            .from(env_1.env.supabaseProfileTable)
            .select('apple_refresh_token')
            .eq('id', userId)
            .maybeSingle();
        if (error) {
            throw new Error(`[getAppleRefreshToken] select failed: ${error.message}`);
        }
        return data?.apple_refresh_token ?? null;
    }
    async deleteUser(id) {
        const client = this.getClient();
        const { data: userLookup, error: lookupError } = await client.auth.admin.getUserById(id);
        if (lookupError) {
            throw new Error(`[deleteUser] admin.getUserById failed: ${lookupError.message}`);
        }
        if (!userLookup?.user) {
            await client.from(env_1.env.supabaseProfileTable).delete().eq('id', id);
            return;
        }
        const { error: profileError } = await client.from(env_1.env.supabaseProfileTable).delete().eq('id', id);
        if (profileError) {
            throw new Error(`[deleteUser] profile delete failed: ${profileError.message}`);
        }
        const { error: userError } = await client.auth.admin.deleteUser(id);
        if (userError) {
            throw new Error(`[deleteUser] admin.deleteUser failed: ${userError.message}`);
        }
    }
    async deleteUserByToken(token) {
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
    async checkProfilesHealth() {
        if (!this.client) {
            return 'not_configured';
        }
        try {
            const { error } = await this.client
                .from(env_1.env.supabaseProfileTable)
                .select('id', { head: true, count: 'exact' });
            if (error) {
                console.error('[health] Supabase health check error', error);
                return 'unavailable';
            }
            return 'ok';
        }
        catch (error) {
            console.error('[health] Supabase health check exception', error);
            return 'unavailable';
        }
    }
};
exports.SupabaseService = SupabaseService;
exports.SupabaseService = SupabaseService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], SupabaseService);
