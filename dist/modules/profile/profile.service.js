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
var ProfileService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileService = void 0;
const common_1 = require("@nestjs/common");
const pool_1 = require("../../db/pool");
const supabase_js_1 = require("@supabase/supabase-js");
const env_1 = require("../../config/env");
const crypto_1 = require("crypto");
const cacheService_1 = require("../../services/cacheService");
require("multer");
let ProfileService = ProfileService_1 = class ProfileService {
    constructor(cacheService) {
        this.cacheService = cacheService;
        this.logger = new common_1.Logger(ProfileService_1.name);
        this.storageClient = (0, supabase_js_1.createClient)(env_1.env.supabaseUrl, env_1.env.supabaseServiceRoleKey);
        this.avatarBucket = 'profileimages';
        this.avatarBucketEnsured = false;
        this.storageAvatarCache = new Map();
        this.STORAGE_AVATAR_TTL = 5 * 60 * 1000; // 5분 캐시
        this.AVATAR_CACHE_PREFIX = 'avatar';
        // 프로필 캐시: 10분 TTL, 최대 1000개
        this.profileCache = new Map();
        this.PROFILE_CACHE_TTL = 15 * 60 * 1000; // 15분으로 확대해 캐시 적중률 향상
        this.MAX_CACHE_SIZE = 1000;
    }
    // 프로필 캐시 관리
    getCachedProfile(userId) {
        const cached = this.profileCache.get(userId);
        if (!cached)
            return null;
        if (Date.now() > cached.expiresAt) {
            this.profileCache.delete(userId);
            return null;
        }
        return cached.data;
    }
    setCachedProfile(userId, profile) {
        // 캐시 크기 제한
        if (this.profileCache.size >= this.MAX_CACHE_SIZE) {
            // 가장 오래된 항목 제거
            const oldestKey = this.profileCache.keys().next().value;
            if (oldestKey)
                this.profileCache.delete(oldestKey);
        }
        this.profileCache.set(userId, {
            data: profile,
            expiresAt: Date.now() + this.PROFILE_CACHE_TTL
        });
    }
    clearCachedProfile(userId) {
        this.profileCache.delete(userId);
    }
    getCachedStorageAvatar(userId) {
        const cached = this.storageAvatarCache.get(userId);
        if (!cached)
            return null;
        if (Date.now() > cached.expiresAt) {
            this.storageAvatarCache.delete(userId);
            return null;
        }
        return cached.url;
    }
    setCachedStorageAvatar(userId, url) {
        this.storageAvatarCache.set(userId, { url, expiresAt: Date.now() + this.STORAGE_AVATAR_TTL });
        if (this.storageAvatarCache.size > 2000) {
            const firstKey = this.storageAvatarCache.keys().next().value;
            if (firstKey)
                this.storageAvatarCache.delete(firstKey);
        }
    }
    async ensureAvatarBucket() {
        if (this.avatarBucketEnsured)
            return;
        const { data, error } = await this.storageClient.storage.getBucket(this.avatarBucket);
        if (error && !error.message.toLowerCase().includes('not found')) {
            throw error;
        }
        if (!data) {
            const { error: createError } = await this.storageClient.storage.createBucket(this.avatarBucket, { public: true });
            if (createError) {
                throw createError;
            }
        }
        else if (!data.public) {
            const { error: updateError } = await this.storageClient.storage.updateBucket(this.avatarBucket, { public: true });
            if (updateError) {
                throw updateError;
            }
        }
        this.avatarBucketEnsured = true;
    }
    async getProfile(userId) {
        // 캐시에서 먼저 확인
        const cachedProfile = this.getCachedProfile(userId);
        if (cachedProfile) {
            return cachedProfile;
        }
        // DB 조회와 Redis 캐시 조회를 병렬로 처리
        const [dbResult, redisProfile] = await Promise.allSettled([
            this.getProfileFromDB(userId),
            this.cacheService.get(`profile:${userId}`)
        ]);
        // Redis 캐시에서 찾았다면 반환
        if (redisProfile.status === 'fulfilled' && redisProfile.value) {
            this.setCachedProfile(userId, redisProfile.value);
            return redisProfile.value;
        }
        // DB에서 조회한 결과 처리
        if (dbResult.status === 'fulfilled' && dbResult.value) {
            const profile = dbResult.value;
            // 메모리 캐시와 Redis 캐시에 동시에 저장 (비동기)
            Promise.allSettled([
                Promise.resolve(this.setCachedProfile(userId, profile)),
                this.cacheService.set(`profile:${userId}`, profile, { ttl: 600 }) // 10분
            ]);
            return profile;
        }
        return null;
    }
    /**
     * 빠른 프로필 조회 - 캐시 우선, DB 접근 최소화, avatar storage 조회 스킵
     */
    async getProfileQuick(userId, fallbackUser) {
        // 1. 메모리 캐시 확인 (가장 빠름)
        const cachedProfile = this.getCachedProfile(userId);
        if (cachedProfile) {
            return cachedProfile;
        }
        // 2. Redis 캐시 확인 (두 번째로 빠름)
        try {
            const redisProfile = await this.cacheService.get(`profile:${userId}`);
            if (redisProfile) {
                this.setCachedProfile(userId, redisProfile);
                return redisProfile;
            }
        }
        catch (error) {
            // Redis 오류는 무시하고 계속 진행
            this.logger.warn(`Redis cache error for user ${userId}:`, error);
        }
        // 3. DB 조회 (가장 느림)
        try {
            const dbProfile = await this.getProfileFromDB(userId);
            if (dbProfile) {
                // 캐시에 저장 (비동기)
                Promise.allSettled([
                    Promise.resolve(this.setCachedProfile(userId, dbProfile)),
                    this.cacheService.set(`profile:${userId}`, dbProfile, { ttl: 600 })
                ]);
                return dbProfile;
            }
        }
        catch (error) {
            this.logger.warn(`DB query error for user ${userId}:`, error);
        }
        // 4. 모든 조회가 실패한 경우 fallback 사용
        if (fallbackUser) {
            return fallbackUser;
        }
        // 5. 최후의 수단: 기본 프로필 생성
        return {
            id: userId,
            email: '',
            name: null,
            avatar_url: null,
            username: userId,
            password_hash: '',
            role: 'user',
            created_at: new Date(),
            updated_at: new Date(),
        };
    }
    async getProfileFromDB(userId) {
        const pool = await (0, pool_1.getPool)();
        const result = await pool.query(`SELECT
         id::text,
         email,
         name,
         avatar_url,
         username,
         role,
         created_at,
         updated_at
       FROM profiles
       WHERE id = $1
       LIMIT 1`, [userId]);
        const row = result.rows[0];
        if (!row)
            return null;
        return {
            id: row.id,
            email: row.email,
            name: row.name,
            avatar_url: row.avatar_url,
            username: row.username,
            role: row.role ?? 'user',
            created_at: row.created_at,
            updated_at: row.updated_at,
            password_hash: '',
        };
    }
    async resolveAvatarFromStorage(userId) {
        try {
            await this.ensureAvatarBucket();
            const { data, error } = await this.storageClient.storage
                .from(this.avatarBucket)
                .list(userId, { sortBy: { column: 'created_at', order: 'desc' }, limit: 1 });
            if (error || !data || data.length === 0) {
                return null;
            }
            const objectName = data[0].name;
            const path = `${userId}/${objectName}`;
            const { data: publicUrlData } = this.storageClient.storage.from(this.avatarBucket).getPublicUrl(path);
            return publicUrlData.publicUrl ?? null;
        }
        catch (error) {
            this.logger.warn(`[resolveAvatarFromStorage] Failed for user ${userId}`, error);
            return null;
        }
    }
    async updateProfile(userId, payload, file) {
        let avatarURL = payload.avatarURL ?? null;
        if (file) {
            avatarURL = await this.uploadToSupabase(userId, file);
        }
        const pool = await (0, pool_1.getPool)();
        const result = await pool.query(`UPDATE profiles
       SET
         name = COALESCE($2, name),
         avatar_url = COALESCE($3, avatar_url),
         updated_at = NOW()
       WHERE id = $1
       RETURNING
         id::text,
         email,
         name,
         avatar_url,
         username,
         role,
         created_at,
         updated_at`, [userId, payload.name ?? null, avatarURL]);
        const row = result.rows[0];
        const updated = {
            id: row.id,
            email: row.email,
            name: row.name,
            avatar_url: row.avatar_url,
            username: row.username,
            role: row.role ?? 'user',
            created_at: row.created_at,
            updated_at: row.updated_at,
            password_hash: '',
        };
        // 캐시 무효화 - 메모리와 Redis 모두
        this.setCachedProfile(userId, updated);
        if (updated.avatar_url) {
            this.setCachedStorageAvatar(userId, updated.avatar_url);
            this.cacheService.set(userId, updated.avatar_url, { prefix: this.AVATAR_CACHE_PREFIX, ttl: 300 }).catch(() => undefined);
        }
        else {
            this.cacheService.del(userId, { prefix: this.AVATAR_CACHE_PREFIX }).catch(() => undefined);
        }
        // Redis에서 사용자 관련 모든 캐시 무효화 (비동기로 실행하여 응답 속도 영향 최소화)
        this.cacheService.invalidateUserCache(userId)
            .catch((error) => this.logger.warn(`Profile cache invalidation failed for user ${userId}:`, error));
        return updated;
    }
    async uploadToSupabase(userId, file) {
        // 파일 유형 및 크기 검증
        const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
        const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!file) {
            throw new common_1.BadRequestException('파일이 업로드되지 않았습니다.');
        }
        if (!ALLOWED_TYPES.includes(file.mimetype)) {
            throw new common_1.BadRequestException('지원되지 않는 파일 형식입니다. JPEG, PNG, GIF, WebP만 허용됩니다.');
        }
        if (file.size > MAX_FILE_SIZE) {
            throw new common_1.BadRequestException('파일 크기가 너무 큽니다. 최대 5MB까지 허용됩니다.');
        }
        const filename = `${userId}/${(0, crypto_1.randomUUID)()}-${file.originalname}`;
        const bucket = this.avatarBucket;
        await this.ensureAvatarBucket();
        const upload = async () => this.storageClient.storage
            .from(bucket)
            .upload(filename, file.buffer, {
            contentType: file.mimetype,
            upsert: true,
        });
        let { error } = await upload();
        if (error && error.message.toLowerCase().includes('bucket not found')) {
            this.avatarBucketEnsured = false;
            await this.ensureAvatarBucket();
            ({ error } = await upload());
        }
        if (error) {
            throw new common_1.BadRequestException(`이미지 업로드 실패: ${error.message}`);
        }
        const { data } = this.storageClient.storage.from(bucket).getPublicUrl(filename);
        const publicUrl = data.publicUrl;
        return publicUrl;
    }
    /**
     * 🚀 FAST: avatar URL만 빠르게 조회 (캐시 우선)
     */
    async getAvatarUrlOnly(userId) {
        try {
            // 1. Redis 캐시 확인 (전역 캐시)
            try {
                const redisAvatar = await this.cacheService.get(userId, { prefix: this.AVATAR_CACHE_PREFIX });
                if (redisAvatar) {
                    this.setCachedStorageAvatar(userId, redisAvatar); // 메모리에도 반영
                    return redisAvatar;
                }
            }
            catch (error) {
                this.logger.warn(`Redis avatar cache miss for ${userId}:`, error);
            }
            // 2. 메모리 캐시 확인
            const cached = this.getCachedProfile(userId);
            if (cached?.avatar_url) {
                return cached.avatar_url;
            }
            // 3. 스토리지 아바타 캐시 확인 (직전 워밍 결과)
            const cachedStorage = this.getCachedStorageAvatar(userId);
            if (cachedStorage) {
                return cachedStorage;
            }
            // 4. DB에서 avatar_url만 조회 (최소한의 쿼리)
            const pool = await (0, pool_1.getPool)();
            const result = await pool.query(`SELECT avatar_url FROM profiles WHERE id = $1 LIMIT 1`, [userId]);
            const dbAvatar = result.rows[0]?.avatar_url;
            if (dbAvatar) {
                // Redis/메모리에 캐시해 다음 호출 가속화
                this.setCachedStorageAvatar(userId, dbAvatar);
                this.cacheService.set(userId, dbAvatar, { prefix: this.AVATAR_CACHE_PREFIX, ttl: 300 }).catch(() => undefined);
                return dbAvatar;
            }
            // 5. Storage에서 최신 아바타를 동기 조회 (1회 시도)
            const storageAvatar = await this.fetchAvatarWithTimeout(userId, 800); // 첫 조회는 더 길게 시도
            if (storageAvatar) {
                // 캐시에 반영해 다음 호출 가속화
                this.setCachedStorageAvatar(userId, storageAvatar);
                this.cacheService.set(userId, storageAvatar, { prefix: this.AVATAR_CACHE_PREFIX, ttl: 300 }).catch(() => undefined);
                return storageAvatar;
            }
            return null;
        }
        catch (error) {
            this.logger.warn(`Avatar URL lookup failed for user ${userId}:`, error);
            return null;
        }
    }
    /**
     * 스토리지에서 아바타를 찾아 캐시/DB에 워밍 (응답 지연 방지용 비동기)
     */
    async warmAvatarFromStorage(userId) {
        try {
            const storageAvatar = await this.resolveAvatarFromStorage(userId);
            if (!storageAvatar)
                return;
            // 캐시 업데이트
            const cached = this.getCachedProfile(userId);
            const hydrated = cached ?? {
                id: userId,
                email: '',
                name: null,
                avatar_url: storageAvatar,
                username: userId,
                role: 'user',
                created_at: new Date(),
                updated_at: new Date(),
                password_hash: '',
            };
            hydrated.avatar_url = storageAvatar;
            hydrated.updated_at = new Date();
            this.setCachedProfile(userId, hydrated);
            this.setCachedStorageAvatar(userId, storageAvatar);
            this.cacheService.set(userId, storageAvatar, { prefix: this.AVATAR_CACHE_PREFIX, ttl: 300 }).catch(() => undefined);
            this.setCachedStorageAvatar(userId, storageAvatar);
            // DB에도 저장 (실패 시 무시)
            const pool = await (0, pool_1.getPool)();
            pool.query(`UPDATE profiles SET avatar_url = $2, updated_at = NOW() WHERE id = $1`, [userId, storageAvatar]).catch(err => this.logger.warn(`[warmAvatarFromStorage] Persist failed for ${userId}: ${err.message}`));
        }
        catch (error) {
            this.logger.warn(`[warmAvatarFromStorage] Failed for ${userId}`, error);
        }
    }
    /**
     * 아바타가 비어 있을 때만 스토리지를 짧은 타임아웃으로 동기 조회
     */
    async fetchAvatarWithTimeout(userId, timeoutMs = 400) {
        // 1. Redis/메모리 캐시 확인
        try {
            const redisAvatar = await this.cacheService.get(userId, { prefix: this.AVATAR_CACHE_PREFIX });
            if (redisAvatar) {
                this.setCachedStorageAvatar(userId, redisAvatar);
                return redisAvatar;
            }
        }
        catch (error) {
            this.logger.warn(`Redis avatar cache miss for ${userId}:`, error);
        }
        const cachedStorage = this.getCachedStorageAvatar(userId);
        if (cachedStorage)
            return cachedStorage;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const avatar = await Promise.race([
                this.resolveAvatarFromStorage(userId),
                new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('storage-timeout')), timeoutMs);
                })
            ]);
            clearTimeout(timeout);
            if (avatar) {
                this.setCachedStorageAvatar(userId, avatar);
                this.cacheService.set(userId, avatar, { prefix: this.AVATAR_CACHE_PREFIX, ttl: 300 }).catch(() => undefined);
                return avatar;
            }
            return null;
        }
        catch (error) {
            clearTimeout(timeout);
            if (error.message !== 'storage-timeout') {
                this.logger.warn(`[fetchAvatarWithTimeout] storage lookup failed for ${userId}`, error);
            }
            // 실패 시 비동기 워밍만 수행
            void this.warmAvatarFromStorage(userId);
            return null;
        }
    }
};
exports.ProfileService = ProfileService;
exports.ProfileService = ProfileService = ProfileService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [cacheService_1.CacheService])
], ProfileService);
