"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ProfileService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileService = void 0;
const common_1 = require("@nestjs/common");
const pool_1 = require("../../db/pool");
const supabase_js_1 = require("@supabase/supabase-js");
const env_1 = require("../../config/env");
const crypto_1 = require("crypto");
require("multer");
let ProfileService = ProfileService_1 = class ProfileService {
    constructor() {
        this.logger = new common_1.Logger(ProfileService_1.name);
        this.storageClient = (0, supabase_js_1.createClient)(env_1.env.supabaseUrl, env_1.env.supabaseServiceRoleKey);
        this.avatarBucket = 'profileimages';
        // 프로필 캐시: 10분 TTL, 최대 1000개
        this.profileCache = new Map();
        this.PROFILE_CACHE_TTL = 10 * 60 * 1000; // 10분
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
    async getProfile(userId) {
        // 캐시에서 먼저 확인
        const cachedProfile = this.getCachedProfile(userId);
        if (cachedProfile) {
            return cachedProfile;
        }
        const pool = await (0, pool_1.getPool)();
        const result = await pool.query(`SELECT
         id::text,
         email,
         name,
         avatar_url,
         username,
         created_at,
         updated_at
       FROM profiles
       WHERE id = $1
       LIMIT 1`, [userId]);
        const row = result.rows[0];
        if (!row)
            return null;
        const profile = {
            id: row.id,
            email: row.email,
            name: row.name,
            avatar_url: row.avatar_url,
            username: row.username,
            created_at: row.created_at,
            updated_at: row.updated_at,
            password_hash: '',
        };
        // 캐시에 저장
        this.setCachedProfile(userId, profile);
        return profile;
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
         created_at,
         updated_at`, [userId, payload.name ?? null, avatarURL]);
        const row = result.rows[0];
        const updated = {
            id: row.id,
            email: row.email,
            name: row.name,
            avatar_url: row.avatar_url,
            username: row.username,
            created_at: row.created_at,
            updated_at: row.updated_at,
            password_hash: '',
        };
        this.setCachedProfile(userId, updated);
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
        const { error } = await this.storageClient.storage
            .from(bucket)
            .upload(filename, file.buffer, {
            contentType: file.mimetype,
            upsert: true,
        });
        if (error) {
            throw new common_1.BadRequestException(`이미지 업로드 실패: ${error.message}`);
        }
        const { data } = this.storageClient.storage.from(bucket).getPublicUrl(filename);
        const publicUrl = data.publicUrl;
        return publicUrl;
    }
};
exports.ProfileService = ProfileService;
exports.ProfileService = ProfileService = ProfileService_1 = __decorate([
    (0, common_1.Injectable)()
], ProfileService);
