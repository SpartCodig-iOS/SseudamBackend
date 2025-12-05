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
var SupabaseService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const supabase_js_1 = require("@supabase/supabase-js");
const env_1 = require("../config/env");
const pool_1 = require("../db/pool");
const oauth_token_service_1 = require("./oauth-token.service");
let SupabaseService = SupabaseService_1 = class SupabaseService {
    constructor(oauthTokenService) {
        this.oauthTokenService = oauthTokenService;
        this.client = null;
        this.logger = new common_1.Logger(SupabaseService_1.name);
        this.avatarBucket = 'profileimages';
        this.avatarBucketEnsured = false;
        this.avatarMirrorPromises = new Map();
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
    getIdentityData(user) {
        return (user.identities ?? [])
            .map((identity) => identity.identity_data)
            .filter((data) => Boolean(data));
    }
    resolveNameFromUser(user, loginType) {
        const metadata = user.user_metadata ?? {};
        const raw = user?.raw_user_meta_data ?? {};
        const identityDataList = this.getIdentityData(user);
        const displayNameFromMetadata = metadata.display_name ??
            metadata.full_name ??
            raw.display_name ??
            raw.full_name ??
            raw.name ??
            null;
        const nameFromMetadata = metadata.name ??
            metadata.full_name ??
            raw.name ??
            raw.full_name ??
            raw.display_name ??
            null;
        const identityName = identityDataList
            .map((data) => data.full_name ??
            data.name ??
            data.given_name ??
            null)
            .find((value) => Boolean(value)) ?? null;
        const shouldPreferDisplay = loginType !== 'email' && loginType !== 'username';
        const displayCandidate = displayNameFromMetadata ?? identityName;
        const nameCandidate = nameFromMetadata ?? identityName;
        return shouldPreferDisplay ? displayCandidate ?? nameCandidate : nameCandidate ?? displayCandidate;
    }
    resolveAvatarFromUser(user) {
        const metadata = user.user_metadata ?? {};
        const raw = user?.raw_user_meta_data ?? {};
        const identityDataList = this.getIdentityData(user);
        const avatarFromMetadata = metadata.avatar_url ??
            metadata.picture ??
            metadata.photo ??
            raw.avatar_url ??
            raw.picture ??
            raw.photo ??
            null;
        const avatarFromIdentity = identityDataList
            .map((data) => data.avatar_url ??
            data.picture ??
            data.photo ??
            null)
            .find((value) => Boolean(value)) ?? null;
        return avatarFromMetadata ?? avatarFromIdentity ?? null;
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
    normalizeUsername(base, userId) {
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
    async ensureUniqueUsername(base, userId) {
        const normalizedBase = this.normalizeUsername(base, userId);
        let candidate = normalizedBase;
        let attempts = 0;
        while (attempts < 10) {
            const pool = await (0, pool_1.getPool)();
            const result = await pool.query(`SELECT id FROM ${env_1.env.supabaseProfileTable} WHERE username = $1 LIMIT 1`, [candidate]);
            const existingId = result.rows[0]?.id;
            if (!existingId || existingId === userId) {
                return candidate;
            }
            const randomSuffix = Math.floor(1000 + Math.random() * 9000);
            candidate = `${normalizedBase}_${randomSuffix}`.slice(0, 32);
            attempts += 1;
        }
        return `${normalizedBase}_${Date.now().toString(36)}`.slice(0, 32);
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
    async findProfileById(id) {
        const pool = await (0, pool_1.getPool)();
        const result = await pool.query(`SELECT id::text, email, username, name, login_type, avatar_url, role, created_at, updated_at
       FROM ${env_1.env.supabaseProfileTable}
       WHERE id = $1
       LIMIT 1`, [id]);
        const row = result.rows[0];
        if (!row)
            return null;
        return {
            id: row.id,
            email: row.email,
            username: row.username,
            name: row.name ?? null,
            login_type: row.login_type ?? null,
            avatar_url: row.avatar_url ?? null,
            role: row.role ?? null,
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    }
    // 배치로 여러 프로필 조회 (성능 최적화)
    async findProfilesByIds(ids) {
        if (ids.length === 0)
            return [];
        const uniqueIds = Array.from(new Set(ids));
        const pool = await (0, pool_1.getPool)();
        const result = await pool.query(`SELECT id::text, email, username, name, login_type, avatar_url, role, created_at, updated_at
       FROM ${env_1.env.supabaseProfileTable}
       WHERE id = ANY($1::uuid[])`, [uniqueIds]);
        const profileMap = new Map(result.rows.map((profile) => [profile.id, profile]));
        return ids.map((id) => profileMap.get(id)).filter(Boolean);
    }
    // 프로필 캐시를 위한 새로운 메서드
    async findProfilesByIdsWithCache(ids, cacheService) {
        if (ids.length === 0)
            return [];
        const uniqueIds = Array.from(new Set(ids));
        const profiles = [];
        const uncachedIds = [];
        // 캐시에서 먼저 조회
        if (cacheService) {
            for (const id of uniqueIds) {
                const cached = await cacheService.get(`profile:${id}`, { ttl: 300 }); // 5분 캐시
                if (cached) {
                    profiles.push(cached);
                }
                else {
                    uncachedIds.push(id);
                }
            }
        }
        else {
            uncachedIds.push(...uniqueIds);
        }
        // 캐시되지 않은 프로필들을 배치로 조회
        if (uncachedIds.length > 0) {
            const uncachedProfiles = await this.findProfilesByIds(uncachedIds);
            // 조회한 프로필들을 캐시에 저장
            if (cacheService) {
                const cachePromises = uncachedProfiles.map(profile => cacheService.set(`profile:${profile?.id}`, profile, { ttl: 300 }));
                await Promise.allSettled(cachePromises); // 캐시 실패가 메인 로직에 영향 안 줌
            }
            profiles.push(...uncachedProfiles);
        }
        // 원본 순서 유지
        const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
        return ids.map(id => profileMap.get(id)).filter(Boolean);
    }
    async upsertProfile(params) {
        const pool = await (0, pool_1.getPool)();
        const now = new Date().toISOString();
        await pool.query(`INSERT INTO ${env_1.env.supabaseProfileTable}
         (id, email, name, username, login_type, avatar_url, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email,
           name = EXCLUDED.name,
           username = EXCLUDED.username,
           login_type = EXCLUDED.login_type,
           avatar_url = EXCLUDED.avatar_url,
           updated_at = EXCLUDED.updated_at`, [
            params.id,
            params.email,
            params.name ?? null,
            params.username,
            params.loginType ?? null,
            params.avatarUrl ?? null,
            now,
        ]);
    }
    async ensureProfileFromSupabaseUser(user, loginType) {
        if (!user.email) {
            throw new Error('Supabase user does not contain an email');
        }
        const pool = await (0, pool_1.getPool)();
        const existingProfileResult = await pool.query(`SELECT username, name, avatar_url
       FROM ${env_1.env.supabaseProfileTable}
       WHERE id = $1
       LIMIT 1`, [user.id]);
        const existingProfile = existingProfileResult.rows[0];
        const existingProfileUsername = existingProfile?.username ?? null;
        const existingProfileName = existingProfile?.name ?? null;
        const existingAvatar = existingProfile?.avatar_url ?? null;
        const proposedUsername = user.user_metadata?.username ??
            user.email.split('@')[0] ??
            user.id;
        const username = existingProfileUsername ??
            (await this.ensureUniqueUsername(proposedUsername, user.id));
        const resolvedName = this.resolveNameFromUser(user, loginType) ??
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
    }
    async saveAppleRefreshToken(userId, refreshToken) {
        await this.oauthTokenService.saveToken(userId, 'apple', refreshToken);
    }
    async getAppleRefreshToken(userId) {
        return this.oauthTokenService.getToken(userId, 'apple');
    }
    async saveGoogleRefreshToken(userId, refreshToken) {
        await this.oauthTokenService.saveToken(userId, 'google', refreshToken);
    }
    async getGoogleRefreshToken(userId) {
        return this.oauthTokenService.getToken(userId, 'google');
    }
    parseAvatarStoragePath(avatarUrl) {
        if (!avatarUrl)
            return null;
        const trimmed = avatarUrl.trim();
        if (!trimmed)
            return null;
        const bucket = this.avatarBucket;
        const normalizedBase = env_1.env.supabaseUrl.replace(/\/$/, '');
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
    detectImageKind(url, contentType) {
        const type = (contentType ?? '').toLowerCase();
        if (type.includes('png'))
            return 'png';
        if (type.includes('jpeg') || type.includes('jpg'))
            return 'jpeg';
        const normalized = (url.split('?')[0] ?? '').toLowerCase();
        const extFromUrl = normalized.split('.').pop() ?? '';
        const cleanExt = extFromUrl.replace(/[^a-z0-9]/g, '');
        if (cleanExt === 'png')
            return 'png';
        if (cleanExt === 'jpg' || cleanExt === 'jpeg')
            return 'jpeg';
        return null;
    }
    async ensureAvatarBucket() {
        if (this.avatarBucketEnsured)
            return;
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
        }
        else if (!data.public) {
            const { error: updateError } = await client.storage.updateBucket(this.avatarBucket, { public: true });
            if (updateError) {
                throw updateError;
            }
        }
        this.avatarBucketEnsured = true;
    }
    async mirrorProfileAvatar(userId, sourceUrl) {
        if (!sourceUrl)
            return null;
        const trimmedUrl = sourceUrl.trim();
        if (!trimmedUrl)
            return null;
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
                const pool = await (0, pool_1.getPool)();
                await pool.query(`UPDATE ${env_1.env.supabaseProfileTable}
             SET avatar_url = $1,
                 updated_at = NOW()
           WHERE id = $2`, [trimmedUrl, userId]);
                return trimmedUrl;
            }
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const contentType = response.headers.get('content-type') ?? undefined;
            const kind = this.detectImageKind(trimmedUrl, contentType);
            // png/jpeg 외 포맷은 건너뛰고 기존 URL 유지
            if (!kind) {
                this.logger.warn(`[mirrorProfileAvatar] Skip unsupported image type for user ${userId} (${contentType ?? 'unknown'})`);
                const pool = await (0, pool_1.getPool)();
                await pool.query(`UPDATE ${env_1.env.supabaseProfileTable}
             SET avatar_url = $1,
                 updated_at = NOW()
           WHERE id = $2`, [trimmedUrl, userId]);
                return trimmedUrl;
            }
            const ext = kind === 'png' ? 'png' : 'jpeg';
            const resolvedContentType = kind === 'png' ? 'image/png' : 'image/jpeg';
            const objectPath = `${this.avatarBucket}/${userId}/${(0, crypto_1.randomUUID)()}.${ext}`;
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
            const publicUrl = `${env_1.env.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${objectPath}`;
            const pool = await (0, pool_1.getPool)();
            await pool.query(`UPDATE ${env_1.env.supabaseProfileTable}
           SET avatar_url = $1,
               updated_at = NOW()
         WHERE id = $2`, [publicUrl, userId]);
            return publicUrl;
        }
        catch (error) {
            this.logger.warn(`[mirrorProfileAvatar] Failed for user ${userId} from ${trimmedUrl}`, error);
            try {
                const pool = await (0, pool_1.getPool)();
                await pool.query(`UPDATE ${env_1.env.supabaseProfileTable}
             SET avatar_url = $1,
                 updated_at = NOW()
           WHERE id = $2`, [trimmedUrl, userId]);
            }
            catch {
                // ignore
            }
            return trimmedUrl;
        }
    }
    /**
     * 아바타가 스토리지에 없으면 다운로드 후 업로드해 영속화. 병렬 중복은 dedupe.
     */
    async ensureProfileAvatar(userId, avatarUrl) {
        if (!avatarUrl)
            return null;
        // 이미 Supabase 스토리지 경로면 그대로 사용
        if (this.parseAvatarStoragePath(avatarUrl)) {
            return avatarUrl;
        }
        const key = `${userId}:${avatarUrl}`;
        const inFlight = this.avatarMirrorPromises.get(key);
        if (inFlight)
            return inFlight;
        const promise = this.mirrorProfileAvatar(userId, avatarUrl)
            .catch((error) => {
            this.logger.warn(`[ensureProfileAvatar] mirror failed for ${userId}`, error);
            return null;
        })
            .finally(() => this.avatarMirrorPromises.delete(key));
        this.avatarMirrorPromises.set(key, promise);
        return promise;
    }
    async deleteProfileImage(avatarUrl) {
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
    async deleteUser(id) {
        // DB 레코드 정리
        const pool = await (0, pool_1.getPool)();
        await pool.query(`DELETE FROM ${env_1.env.supabaseProfileTable} WHERE id = $1`, [id]);
        // Supabase auth 사용자 삭제(스토리지/인증만 사용)
        const client = this.getClient();
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
        try {
            const pool = await (0, pool_1.getPool)();
            await pool.query(`SELECT 1 FROM ${env_1.env.supabaseProfileTable} LIMIT 1`);
            return 'ok';
        }
        catch (error) {
            console.error('[health] Profile table health check failed', error);
            return 'unavailable';
        }
    }
};
exports.SupabaseService = SupabaseService;
exports.SupabaseService = SupabaseService = SupabaseService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [oauth_token_service_1.OAuthTokenService])
], SupabaseService);
