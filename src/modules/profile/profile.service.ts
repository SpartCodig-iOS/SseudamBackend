import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { getPool } from '../../db/pool';
import { UpdateProfileInput } from '../../validators/profileSchemas';
import { UserRecord } from '../../types/user';
import { createClient } from '@supabase/supabase-js';
import { env } from '../../config/env';
import { randomUUID } from 'crypto';
import { Express } from 'express';
import { CacheService } from '../../services/cacheService';
import 'multer';

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);
  private readonly storageClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
  private readonly avatarBucket = 'profileimages';
  private avatarBucketEnsured = false;

  constructor(private readonly cacheService: CacheService) {}

  // 프로필 캐시: 10분 TTL, 최대 1000개
  private readonly profileCache = new Map<string, { data: UserRecord; expiresAt: number }>();
  private readonly PROFILE_CACHE_TTL = 10 * 60 * 1000; // 10분
  private readonly MAX_CACHE_SIZE = 1000;

  // 프로필 캐시 관리
  private getCachedProfile(userId: string): UserRecord | null {
    const cached = this.profileCache.get(userId);
    if (!cached) return null;

    if (Date.now() > cached.expiresAt) {
      this.profileCache.delete(userId);
      return null;
    }

    return cached.data;
  }

  private setCachedProfile(userId: string, profile: UserRecord): void {
    // 캐시 크기 제한
    if (this.profileCache.size >= this.MAX_CACHE_SIZE) {
      // 가장 오래된 항목 제거
      const oldestKey = this.profileCache.keys().next().value;
      if (oldestKey) this.profileCache.delete(oldestKey);
    }

    this.profileCache.set(userId, {
      data: profile,
      expiresAt: Date.now() + this.PROFILE_CACHE_TTL
    });
  }

  private clearCachedProfile(userId: string): void {
    this.profileCache.delete(userId);
  }

  private async ensureAvatarBucket(): Promise<void> {
    if (this.avatarBucketEnsured) return;
    const { data, error } = await this.storageClient.storage.getBucket(this.avatarBucket);
    if (error && !error.message.toLowerCase().includes('not found')) {
      throw error;
    }
    if (!data) {
      const { error: createError } = await this.storageClient.storage.createBucket(this.avatarBucket, { public: true });
      if (createError) {
        throw createError;
      }
    } else if (!data.public) {
      const { error: updateError } = await this.storageClient.storage.updateBucket(this.avatarBucket, { public: true });
      if (updateError) {
        throw updateError;
      }
    }
    this.avatarBucketEnsured = true;
  }

  async getProfile(userId: string): Promise<UserRecord | null> {
    // 캐시에서 먼저 확인
    const cachedProfile = this.getCachedProfile(userId);
    if (cachedProfile) {
      return cachedProfile;
    }

    // DB 조회와 Redis 캐시 조회를 병렬로 처리
    const [dbResult, redisProfile] = await Promise.allSettled([
      this.getProfileFromDB(userId),
      this.cacheService.get<UserRecord>(`profile:${userId}`)
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

  private async getProfileFromDB(userId: string): Promise<UserRecord | null> {
    const pool = await getPool();
    const result = await pool.query(
      `SELECT
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
       LIMIT 1`,
      [userId],
    );

    const row = result.rows[0];
    if (!row) return null;

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

  async updateProfile(
    userId: string,
    payload: UpdateProfileInput,
    file?: Express.Multer.File,
  ): Promise<UserRecord> {
    let avatarURL = payload.avatarURL ?? null;
    if (file) {
      avatarURL = await this.uploadToSupabase(userId, file);
    }

    const pool = await getPool();
    const result = await pool.query(
      `UPDATE profiles
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
         updated_at`,
      [userId, payload.name ?? null, avatarURL],
    );
    const row = result.rows[0];
    const updated: UserRecord = {
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

    // Redis에서 사용자 관련 모든 캐시 무효화 (비동기로 실행하여 응답 속도 영향 최소화)
    this.cacheService.invalidateUserCache(userId)
      .catch((error) => this.logger.warn(`Profile cache invalidation failed for user ${userId}:`, error));

    return updated;
  }

  private async uploadToSupabase(userId: string, file: Express.Multer.File): Promise<string> {
    // 파일 유형 및 크기 검증
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

    if (!file) {
      throw new BadRequestException('파일이 업로드되지 않았습니다.');
    }

    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('지원되지 않는 파일 형식입니다. JPEG, PNG, GIF, WebP만 허용됩니다.');
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException('파일 크기가 너무 큽니다. 최대 5MB까지 허용됩니다.');
    }

    const filename = `${userId}/${randomUUID()}-${file.originalname}`;
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
      throw new BadRequestException(`이미지 업로드 실패: ${error.message}`);
    }

    const { data } = this.storageClient.storage.from(bucket).getPublicUrl(filename);
    const publicUrl = data.publicUrl;

    return publicUrl;
  }
}
