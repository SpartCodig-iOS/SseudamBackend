"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileService = void 0;
const common_1 = require("@nestjs/common");
const pool_1 = require("../../db/pool");
const supabase_js_1 = require("@supabase/supabase-js");
const env_1 = require("../../config/env");
const crypto_1 = require("crypto");
require("multer");
let ProfileService = class ProfileService {
    constructor() {
        this.storageClient = (0, supabase_js_1.createClient)(env_1.env.supabaseUrl, env_1.env.supabaseServiceRoleKey);
        this.avatarBucket = 'profileimages';
    }
    async getProfile(userId) {
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
        return {
            id: row.id,
            email: row.email,
            name: row.name,
            avatar_url: row.avatar_url,
            username: row.username,
            created_at: row.created_at,
            updated_at: row.updated_at,
            password_hash: '',
        };
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
        return {
            id: row.id,
            email: row.email,
            name: row.name,
            avatar_url: row.avatar_url,
            username: row.username,
            created_at: row.created_at,
            updated_at: row.updated_at,
            password_hash: '',
        };
    }
    async uploadToSupabase(userId, file) {
        if (!file || !file.mimetype.startsWith('image/')) {
            throw new common_1.BadRequestException('유효한 이미지 파일을 업로드하세요.');
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
exports.ProfileService = ProfileService = __decorate([
    (0, common_1.Injectable)()
], ProfileService);
