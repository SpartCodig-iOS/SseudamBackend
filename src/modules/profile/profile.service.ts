import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UpdateProfileInput } from '../../validators/profileSchemas';
import { UserRecord } from '../../types/user';
import { createClient } from '@supabase/supabase-js';
import { env } from '../../config/env';
import { randomUUID } from 'crypto';
import { Express } from 'express';
import { CacheService } from '../../services/cacheService';
import { SupabaseService } from '../../services/supabaseService';
import { ImageProcessor, ImageVariant } from '../../utils/imageProcessor';
import 'multer';

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);
  private readonly storageClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
  private readonly avatarBucket = 'profileimages';
  private avatarBucketEnsured = false;
  private readonly storageAvatarCache = new Map<string, { url: string; expiresAt: number }>();
  private readonly imageVariantsCache = new Map<string, { variants: any[]; expiresAt: number }>();
  private readonly STORAGE_AVATAR_TTL = 5 * 60 * 1000; // 5분 캐시
  private readonly IMAGE_VARIANTS_TTL = 15 * 60 * 1000; // 15분 캐시 (더 오래)
  private readonly AVATAR_CACHE_PREFIX = 'avatar';
  private readonly AVATAR_VARIANTS_PREFIX = 'avatar_variants';
  private readonly AVATAR_FETCH_TIMEOUT_MS = 1200; // 아바타 동기 조회 타임아웃 (초기 조회 실패 방지)

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly cacheService: CacheService,
    private readonly supabaseService: SupabaseService,
  ) {}

  // 프로필 캐시: 10분 TTL, 최대 1000개
  private readonly profileCache = new Map<string, { data: UserRecord; expiresAt: number }>();
  private readonly PROFILE_CACHE_TTL = 45 * 60 * 1000; // 45분으로 늘려 적중률 향상
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

  private getCachedStorageAvatar(userId: string): string | null {
    const cached = this.storageAvatarCache.get(userId);
    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
      this.storageAvatarCache.delete(userId);
      return null;
    }
    return cached.url;
  }

  private setCachedStorageAvatar(userId: string, url: string): void {
    this.storageAvatarCache.set(userId, { url, expiresAt: Date.now() + this.STORAGE_AVATAR_TTL });
    if (this.storageAvatarCache.size > 2000) {
      const firstKey = this.storageAvatarCache.keys().next().value;
      if (firstKey) this.storageAvatarCache.delete(firstKey);
    }
  }

  private getCachedImageVariants(userId: string): any[] | null {
    const cached = this.imageVariantsCache.get(userId);
    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
      this.imageVariantsCache.delete(userId);
      return null;
    }
    return cached.variants;
  }

  private setCachedImageVariants(userId: string, variants: any[]): void {
    this.imageVariantsCache.set(userId, {
      variants,
      expiresAt: Date.now() + this.IMAGE_VARIANTS_TTL
    });
    if (this.imageVariantsCache.size > 1000) {
      const firstKey = this.imageVariantsCache.keys().next().value;
      if (firstKey) this.imageVariantsCache.delete(firstKey);
    }
  }

  /**
   * 이미지 변형들을 캐시에 저장 (메모리 + Redis)
   */
  private cacheImageVariants(userId: string, variants: any[]): void {
    // 메모리 캐시
    this.setCachedImageVariants(userId, variants);

    // Redis 캐시 (비동기)
    this.cacheService.set(userId, variants, {
      prefix: this.AVATAR_VARIANTS_PREFIX,
      ttl: 900 // 15분
    }).catch(() => undefined);
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
    // 1. 캐시에서 먼저 확인 (가장 빠름)
    const cachedProfile = this.getCachedProfile(userId);
    if (cachedProfile) {
      // 동기 처리를 비동기로 변경하여 응답 시간 단축
      this.syncGoogleAvatarIfNeeded(cachedProfile).catch(() => undefined);
      this.validateStorageAvatar(cachedProfile).catch(() => undefined);
      return cachedProfile;
    }

    // 2. DB 조회와 Redis 캐시 조회를 병렬로 처리
    const [dbResult, redisProfile] = await Promise.allSettled([
      this.getProfileFromDB(userId),
      this.cacheService.get<UserRecord>(`profile:${userId}`)
    ]);

    // 3. Redis 캐시에서 찾았다면 반환
    if (redisProfile.status === 'fulfilled' && redisProfile.value) {
      const profile = redisProfile.value;
      this.setCachedProfile(userId, profile);

      // 백그라운드에서 동기화 처리 (응답 시간에 영향 없음)
      this.syncGoogleAvatarIfNeeded(profile).catch(() => undefined);
      this.validateStorageAvatar(profile).catch(() => undefined);

      return profile;
    }

    // 4. DB에서 조회한 결과 처리
    if (dbResult.status === 'fulfilled' && dbResult.value) {
      const profile = dbResult.value;

      // 메모리 캐시와 Redis 캐시에 동시에 저장 (비동기)
      Promise.allSettled([
        Promise.resolve(this.setCachedProfile(userId, profile)),
        this.cacheService.set(`profile:${userId}`, profile, { ttl: 600 }) // 10분
      ]);

      // 백그라운드에서 동기화 처리 (응답 시간에 영향 없음)
      this.syncGoogleAvatarIfNeeded(profile).catch(() => undefined);
      this.validateStorageAvatar(profile).catch(() => undefined);

      return profile;
    }

    return null;
  }

  /**
   * 빠른 프로필 조회 - 캐시 우선, DB 접근 최소화, avatar storage 조회 스킵
   */
  async getProfileQuick(userId: string, fallbackUser?: UserRecord): Promise<UserRecord> {
    // 1. 메모리 캐시 확인 (가장 빠름)
    const cachedProfile = this.getCachedProfile(userId);
    if (cachedProfile) {
      // 🚀 동기화를 백그라운드로 이동 (응답 지연 없음)
      this.syncGoogleAvatarIfNeeded(cachedProfile).catch(() => undefined);
      return cachedProfile;
    }

    // 2. Redis 캐시 확인 (두 번째로 빠름)
    try {
      const redisProfile = await this.cacheService.get<UserRecord>(`profile:${userId}`);
      if (redisProfile) {
        this.setCachedProfile(userId, redisProfile);
        // 🚀 동기화를 백그라운드로 이동 (응답 지연 없음)
        this.syncGoogleAvatarIfNeeded(redisProfile).catch(() => undefined);
        this.validateStorageAvatar(redisProfile).catch(() => undefined);
        return redisProfile;
      }
    } catch (error) {
      // Redis 오류는 무시하고 계속 진행
      this.logger.warn(`Redis cache error for user ${userId}:`, error);
    }

    // 3. DB 조회 (가장 느림)
    try {
      const dbProfile = await this.getProfileFromDB(userId);
      if (dbProfile) {
        // 캐시 저장을 비동기로 처리
        Promise.allSettled([
          Promise.resolve(this.setCachedProfile(userId, dbProfile)),
          this.cacheService.set(`profile:${userId}`, dbProfile, { ttl: 600 })
        ]);
        // 🚀 동기화를 백그라운드로 이동 (응답 지연 없음)
        this.syncGoogleAvatarIfNeeded(dbProfile).catch(() => undefined);
        this.validateStorageAvatar(dbProfile).catch(() => undefined);
        return dbProfile;
      }
    } catch (error) {
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

  private async validateStorageAvatar(profile: UserRecord): Promise<UserRecord> {
    if (!profile?.avatar_url) {
      return profile;
    }

    const exists = await this.supabaseService.storageAvatarExists(profile.avatar_url);
    if (exists) {
      return profile;
    }

    profile.avatar_url = null;
    this.setCachedProfile(profile.id, profile);
    this.cacheService.set(`profile:${profile.id}`, profile, { ttl: 600 }).catch(() => undefined);
    await this.supabaseService.clearAvatarUrl(profile.id);
    return profile;
  }

  private async syncGoogleAvatarIfNeeded(profile: UserRecord): Promise<UserRecord> {
    if (!profile) return profile;
    if (profile.avatar_url && this.supabaseService.parseAvatarStoragePath(profile.avatar_url)) {
      return profile;
    }

    try {
      const supabaseProfile = await this.supabaseService.findProfileById(profile.id);
      const loginType = supabaseProfile?.login_type?.toLowerCase();
      if (loginType !== 'google') {
        return profile;
      }

      const supabaseUser = await this.supabaseService.getUserById(profile.id);
      if (!supabaseUser) {
        return profile;
      }

      const avatarUrl = this.supabaseService.resolveAvatarFromUser(supabaseUser);
      if (!avatarUrl) {
        return profile;
      }

      const mirroredUrl = await this.supabaseService.ensureProfileAvatar(profile.id, avatarUrl);
      if (mirroredUrl && mirroredUrl !== profile.avatar_url) {
        profile.avatar_url = mirroredUrl;
        this.setCachedProfile(profile.id, profile);
        this.cacheService.set(`profile:${profile.id}`, profile, { ttl: 600 }).catch(() => undefined);
        this.setCachedStorageAvatar(profile.id, mirroredUrl);
        this.cacheService.set(profile.id, mirroredUrl, {
          prefix: this.AVATAR_CACHE_PREFIX,
          ttl: 300,
        }).catch(() => undefined);
      }
    } catch (error) {
      this.logger.warn(`[syncGoogleAvatarIfNeeded] Failed for ${profile.id}`, error as Error);
    }

    return profile;
  }

  private async getProfileFromDB(userId: string): Promise<UserRecord | null> {
    const rows = await this.dataSource.query(
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

    const row = rows[0];
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

  async resolveAvatarFromStorage(userId: string): Promise<string | null> {
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
    } catch (error) {
      this.logger.warn(`[resolveAvatarFromStorage] Failed for user ${userId}`, error as Error);
      return null;
    }
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

    const rows = await this.dataSource.query(
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
    const row = rows[0];
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
    if (updated.avatar_url) {
      this.setCachedStorageAvatar(userId, updated.avatar_url);
      this.cacheService.set(userId, updated.avatar_url, { prefix: this.AVATAR_CACHE_PREFIX, ttl: 300 }).catch(() => undefined);
    } else {
      this.cacheService.del(userId, { prefix: this.AVATAR_CACHE_PREFIX }).catch(() => undefined);
    }

    // 🔄 Redis에서 사용자 관련 모든 캐시 무효화 (OAuth 캐시 포함)
    Promise.allSettled([
      this.cacheService.invalidateUserCache(userId),
      // OAuth 관련 캐시들도 무효화
      this.cacheService.del(`profile_exists:${userId}`),
      this.cacheService.del(`oauth_user:${userId}`),
      this.cacheService.del(userId, { prefix: 'profile_exists' }),
      this.cacheService.del(userId, { prefix: 'oauth' }),
      this.cacheService.del(userId, { prefix: 'auth' }),
    ]).catch((error) => this.logger.warn(`Profile cache invalidation failed for user ${userId}:`, error));

    return updated;
  }

  private async uploadToSupabase(userId: string, file: Express.Multer.File): Promise<string> {
    // 파일 유형 및 크기 검증
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

    if (!file) {
      throw new BadRequestException('파일이 업로드되지 않았습니다.');
    }

    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('지원되지 않는 파일 형식입니다. JPEG, PNG, GIF, WebP만 허용됩니다.');
    }

    try {
      // 이미지 최적화 처리 - 여러 크기 버전 생성
      const imageVariants = await ImageProcessor.processImageVariants(
        file.buffer,
        file.originalname,
        userId
      );

      await this.ensureAvatarBucket();

      // 모든 이미지 변형 업로드 (병렬 처리)
      const uploadPromises = imageVariants.map(async (variant) => {
        const upload = async () => this.storageClient.storage
          .from(this.avatarBucket)
          .upload(variant.filename, variant.buffer, {
            contentType: variant.contentType,
            upsert: true,
          });

        let { error } = await upload();
        if (error && error.message.toLowerCase().includes('bucket not found')) {
          this.avatarBucketEnsured = false;
          await this.ensureAvatarBucket();
          ({ error } = await upload());
        }

        if (error) {
          throw new BadRequestException(`이미지 업로드 실패 (${variant.size}): ${error.message}`);
        }

        const { data } = this.storageClient.storage.from(this.avatarBucket).getPublicUrl(variant.filename);
        return {
          size: variant.size,
          url: data.publicUrl,
          originalSize: variant.originalSize,
          processedSize: variant.processedSize
        };
      });

      const uploadedVariants = await Promise.all(uploadPromises);

      // 원본 크기 이미지 URL을 메인 아바타로 반환 (기존 호환성 유지)
      const originalVariant = uploadedVariants.find(v => v.size === 'original');
      if (!originalVariant) {
        throw new BadRequestException('원본 이미지 업로드에 실패했습니다.');
      }

      // 캐시에 모든 변형 저장 (빠른 로딩용)
      this.cacheImageVariants(userId, uploadedVariants);

      const compressionRatio = Math.round((1 - originalVariant.processedSize / originalVariant.originalSize) * 100);
      this.logger.log(
        `이미지 최적화 완료: ${originalVariant.originalSize}B → ${originalVariant.processedSize}B (${compressionRatio}% 압축)`
      );

      return originalVariant.url;

    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`이미지 처리 실패: ${(error as Error).message}`);
    }
  }

  /**
   * 🚀 ULTRA FAST: 썸네일 이미지 우선 조회 (150x150, WebP)
   */
  async getAvatarThumbnail(userId: string): Promise<string | null> {
    try {
      // 1. 캐시에서 이미지 변형들 확인
      const cachedVariants = this.getCachedImageVariants(userId);
      if (cachedVariants) {
        const thumbnail = cachedVariants.find(v => v.size === 'thumbnail');
        if (thumbnail) return thumbnail.url;
      }

      // 2. Redis에서 변형들 조회
      try {
        const redisVariants = await this.cacheService.get<any[]>(userId, { prefix: this.AVATAR_VARIANTS_PREFIX });
        if (redisVariants) {
          this.setCachedImageVariants(userId, redisVariants);
          const thumbnail = redisVariants.find(v => v.size === 'thumbnail');
          if (thumbnail) return thumbnail.url;
        }
      } catch (error) {
        this.logger.warn(`Redis variants cache miss for ${userId}:`, error);
      }

      // 3. 일반 아바타 조회로 폴백
      return this.getAvatarUrlOnly(userId);
    } catch (error) {
      this.logger.warn(`Thumbnail lookup failed for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * 🚀 FAST: 중간 크기 이미지 조회 (400px, WebP)
   */
  async getAvatarMedium(userId: string): Promise<string | null> {
    try {
      // 1. 캐시에서 이미지 변형들 확인
      const cachedVariants = this.getCachedImageVariants(userId);
      if (cachedVariants) {
        const medium = cachedVariants.find(v => v.size === 'medium');
        if (medium) return medium.url;
      }

      // 2. Redis에서 변형들 조회
      try {
        const redisVariants = await this.cacheService.get<any[]>(userId, { prefix: this.AVATAR_VARIANTS_PREFIX });
        if (redisVariants) {
          this.setCachedImageVariants(userId, redisVariants);
          const medium = redisVariants.find(v => v.size === 'medium');
          if (medium) return medium.url;
        }
      } catch (error) {
        this.logger.warn(`Redis variants cache miss for ${userId}:`, error);
      }

      // 3. 일반 아바타 조회로 폴백
      return this.getAvatarUrlOnly(userId);
    } catch (error) {
      this.logger.warn(`Medium avatar lookup failed for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * 🚀 FAST: avatar URL만 빠르게 조회 (캐시 우선)
   */
  async getAvatarUrlOnly(userId: string): Promise<string | null> {
    try {
      // 1. Redis 캐시 확인 (전역 캐시)
      try {
        const redisAvatar = await this.cacheService.get<string>(userId, { prefix: this.AVATAR_CACHE_PREFIX });
        if (redisAvatar) {
          this.setCachedStorageAvatar(userId, redisAvatar); // 메모리에도 반영
          return redisAvatar;
        }
      } catch (error) {
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
      const avatarRows = await this.dataSource.query(
        `SELECT avatar_url FROM profiles WHERE id = $1 LIMIT 1`,
        [userId],
      );

      const dbAvatar = avatarRows[0]?.avatar_url as string | null | undefined;
      if (dbAvatar) {
        // Redis/메모리에 캐시해 다음 호출 가속화
        this.setCachedStorageAvatar(userId, dbAvatar);
        this.cacheService.set(userId, dbAvatar, { prefix: this.AVATAR_CACHE_PREFIX, ttl: 300 }).catch(() => undefined);
        return dbAvatar;
      }

      // 5. Storage에서 최신 아바타를 동기 조회 (1회 시도)
      const storageAvatar = await this.fetchAvatarWithTimeout(userId, 600); // 첫 조회는 더 길게 시도
      if (storageAvatar) {
        // 캐시에 반영해 다음 호출 가속화
        this.setCachedStorageAvatar(userId, storageAvatar);
        this.cacheService.set(userId, storageAvatar, { prefix: this.AVATAR_CACHE_PREFIX, ttl: 300 }).catch(() => undefined);
        return storageAvatar;
      }

      return null;
    } catch (error) {
      this.logger.warn(`Avatar URL lookup failed for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * 스토리지에서 아바타를 찾아 캐시/DB에 워밍 (응답 지연 방지용 비동기)
   */
  async warmAvatarFromStorage(userId: string): Promise<void> {
    try {
      const storageAvatar = await this.resolveAvatarFromStorage(userId);
      if (!storageAvatar) return;

      // 캐시 업데이트
      const cached = this.getCachedProfile(userId);
      const hydrated: UserRecord = cached ?? {
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
      this.dataSource.query(
        `UPDATE profiles SET avatar_url = $2, updated_at = NOW() WHERE id = $1`,
        [userId, storageAvatar],
      ).catch((err: Error) => this.logger.warn(`[warmAvatarFromStorage] Persist failed for ${userId}: ${err.message}`));
    } catch (error) {
      this.logger.warn(`[warmAvatarFromStorage] Failed for ${userId}`, error as Error);
    }
  }

  /**
   * 아바타가 비어 있을 때만 스토리지를 짧은 타임아웃으로 동기 조회
   */
  async fetchAvatarWithTimeout(userId: string, timeoutMs = 600): Promise<string | null> {
    // 1. Redis/메모리 캐시 확인
    try {
      const redisAvatar = await this.cacheService.get<string>(userId, { prefix: this.AVATAR_CACHE_PREFIX });
      if (redisAvatar) {
        this.setCachedStorageAvatar(userId, redisAvatar);
        return redisAvatar;
      }
    } catch (error) {
      this.logger.warn(`Redis avatar cache miss for ${userId}:`, error);
    }

    const cachedStorage = this.getCachedStorageAvatar(userId);
    if (cachedStorage) return cachedStorage;

    const effectiveTimeout = Math.min(timeoutMs, this.AVATAR_FETCH_TIMEOUT_MS);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), effectiveTimeout);

    try {
      const avatar = await Promise.race([
        this.resolveAvatarFromStorage(userId),
        new Promise<string | null>((_, reject) => {
          setTimeout(() => reject(new Error('storage-timeout')), effectiveTimeout);
        })
      ]);

      clearTimeout(timeout);

      if (avatar) {
        this.setCachedStorageAvatar(userId, avatar);
        this.cacheService.set(userId, avatar, { prefix: this.AVATAR_CACHE_PREFIX, ttl: 300 }).catch(() => undefined);
        return avatar;
      }
      return null;
    } catch (error) {
      clearTimeout(timeout);
      if ((error as Error).message !== 'storage-timeout') {
        this.logger.warn(`[fetchAvatarWithTimeout] storage lookup failed for ${userId}`, error as Error);
      }
      // 실패 시 비동기 워밍만 수행
      void this.warmAvatarFromStorage(userId);
      return null;
    }
  }
}
