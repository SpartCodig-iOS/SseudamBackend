import { createHash } from 'node:crypto';
import { Injectable, ServiceUnavailableException, UnauthorizedException, BadRequestException, Inject, forwardRef, Logger } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { LoginType } from '../../types/auth';
import { UserRecord } from '../../types/user';
import { SupabaseService } from '../../services/supabaseService';
import { CacheService } from '../../services/cacheService';
import { AuthService, AuthSessionPayload } from '../auth/auth.service';
import { fromSupabaseUser } from '../../utils/mappers';
import { env } from '../../config/env';
import { getPool } from '../../db/pool';
import { BackgroundJobService } from '../../services/background-job.service';

export interface SocialLookupResult {
  registered: boolean;
}

export interface OAuthTokenOptions {
  appleRefreshToken?: string | null;
  googleRefreshToken?: string | null;
  authorizationCode?: string | null;
  codeVerifier?: string | null;
  redirectUri?: string | null;
}

@Injectable()
export class SocialAuthService {
  private readonly logger = new Logger(SocialAuthService.name);

  // Apple JWT 토큰 캐싱 (10분 TTL)
  private appleClientSecretCache: { token: string; expiresAt: number } | null = null;

  // OAuth 토큰 교환 요청 캐싱 (중복 요청 방지)
  private readonly tokenExchangePromises = new Map<string, Promise<string>>();

  private readonly OAUTH_USER_CACHE_TTL_SECONDS = 10 * 60; // 10분으로 확대하여 캐시 적중률 상승
  private readonly OAUTH_TOKEN_CACHE_PREFIX = 'oauth:token';
  private readonly OAUTH_USER_INDEX_PREFIX = 'oauth:user-index';
  private readonly OAUTH_USER_INDEX_TTL_SECONDS = 60 * 30; // 30분
  private readonly OAUTH_USER_INDEX_LIMIT = 12;
  private readonly oauthCheckCache = new Map<string, { registered: boolean; expiresAt: number }>();
  private readonly lookupPromiseCache = new Map<string, { promise: Promise<SocialLookupResult>; expiresAt: number }>();
  private readonly profileExistenceCache = new Map<string, { exists: boolean; expiresAt: number }>();
  private readonly OAUTH_CHECK_CACHE_TTL = 5 * 60 * 1000; // 5분
  private readonly LOOKUP_INFLIGHT_TTL = 5 * 1000; // 동일 토큰 연속 호출 병합용 (5초)
  private readonly PROFILE_EXISTS_TTL = 60 * 1000; // 프로필 존재 여부 캐시
  private readonly PROFILE_EXISTS_REDIS_TTL = 5 * 60; // 5분
  private readonly PROFILE_EXISTS_REDIS_PREFIX = 'profile_exists';
  private readonly localTokenCache = new Map<string, { user: UserRecord; expiresAt: number }>();
  private readonly LOCAL_TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5분
  private dbWarmupPromise: Promise<void> | null = null;

  // 네트워크 타임아웃 설정 (빠른 실패)
  private readonly NETWORK_TIMEOUT = 8000; // 8초

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly cacheService: CacheService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly backgroundJobService: BackgroundJobService,
  ) {}

  private ensureAppleEnv() {
    if (!env.appleClientId || !env.appleTeamId || !env.appleKeyId || !env.applePrivateKey) {
      throw new ServiceUnavailableException('Apple credentials are not configured');
    }
  }

  private ensureGoogleEnv() {
    if (!env.googleClientId || !env.googleClientSecret) {
      throw new ServiceUnavailableException('Google credentials are not configured');
    }
  }

  private getTokenCacheKey(accessToken: string): string {
    return createHash('sha256').update(accessToken).digest('hex');
  }

  private getLocalCachedUser(accessToken: string): UserRecord | null {
    const cached = this.localTokenCache.get(accessToken);
    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
      this.localTokenCache.delete(accessToken);
      return null;
    }
    return cached.user;
  }

  private setLocalCachedUser(accessToken: string, user: UserRecord): void {
    this.localTokenCache.set(accessToken, {
      user,
      expiresAt: Date.now() + this.LOCAL_TOKEN_CACHE_TTL,
    });
  }

  private async profileExists(userId: string): Promise<boolean> {
    const cached = this.profileExistenceCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.exists;
    }

    try {
      const redisCached = await this.cacheService.get<boolean>(userId, {
        prefix: this.PROFILE_EXISTS_REDIS_PREFIX,
      });
      if (typeof redisCached === 'boolean') {
        this.profileExistenceCache.set(userId, {
          exists: redisCached,
          expiresAt: Date.now() + this.PROFILE_EXISTS_TTL,
        });
        return redisCached;
      }
    } catch (error) {
      this.logger.warn(`Redis profile exists miss for ${userId}:`, error as Error);
    }

    try {
      const pool = await getPool();
      const result = await pool.query(
        `SELECT 1 FROM profiles WHERE id = $1 LIMIT 1`,
        [userId],
      );
      const exists = Boolean(result.rows[0]);
      this.profileExistenceCache.set(userId, {
        exists,
        expiresAt: Date.now() + this.PROFILE_EXISTS_TTL,
      });
      // Redis에도 캐싱
      this.cacheService.set(userId, exists, {
        prefix: this.PROFILE_EXISTS_REDIS_PREFIX,
        ttl: this.PROFILE_EXISTS_REDIS_TTL,
      }).catch(() => undefined);
      return exists;
    } catch (error) {
      this.logger.warn(`Fast profile existence check failed for user ${userId}, falling back to Supabase`, error as Error);
      try {
        const profile = await this.supabaseService.findProfileById(userId);
        const exists = Boolean(profile);
        this.profileExistenceCache.set(userId, {
          exists,
          expiresAt: Date.now() + Math.floor(this.PROFILE_EXISTS_TTL / 2),
        });
        this.cacheService.set(userId, exists, {
          prefix: this.PROFILE_EXISTS_REDIS_PREFIX,
          ttl: this.PROFILE_EXISTS_REDIS_TTL,
        }).catch(() => undefined);
        return exists;
      } catch (fallbackError) {
        this.logger.warn(`Profile existence fallback failed for user ${userId}`, fallbackError as Error);
        return false;
      }
    }
  }

  // Redis 기반 OAuth 사용자 캐시 (fallback으로 내부 CacheService 메모리 캐시 사용)
  private async getCachedOAuthUser(accessToken: string): Promise<UserRecord | null> {
    const local = this.getLocalCachedUser(accessToken);
    if (local) {
      return local;
    }

    const cacheKey = this.getTokenCacheKey(accessToken);
    const cached = await this.cacheService.get<UserRecord>(cacheKey, {
      prefix: this.OAUTH_TOKEN_CACHE_PREFIX,
    });
    if (cached) {
      this.setLocalCachedUser(accessToken, cached);
    }
    return cached ?? null;
  }

  private async setCachedOAuthUser(accessToken: string, user: UserRecord): Promise<void> {
    this.setLocalCachedUser(accessToken, user);
    const cacheKey = this.getTokenCacheKey(accessToken);
    await this.cacheService.set(cacheKey, user, {
      prefix: this.OAUTH_TOKEN_CACHE_PREFIX,
      ttl: this.OAUTH_USER_CACHE_TTL_SECONDS,
    });

    await this.trackTokenCacheKey(user.id, cacheKey);
  }

  private async trackTokenCacheKey(userId: string, tokenKey: string): Promise<void> {
    const existing =
      (await this.cacheService.get<string[]>(userId, {
        prefix: this.OAUTH_USER_INDEX_PREFIX,
      })) ?? [];

    const deduped = [tokenKey, ...existing.filter((key) => key !== tokenKey)].slice(
      0,
      this.OAUTH_USER_INDEX_LIMIT,
    );

    await this.cacheService.set(userId, deduped, {
      prefix: this.OAUTH_USER_INDEX_PREFIX,
      ttl: this.OAUTH_USER_INDEX_TTL_SECONDS,
    });
  }

  async invalidateOAuthCacheByUser(userId: string): Promise<void> {
    const tokenKeys =
      (await this.cacheService.get<string[]>(userId, {
        prefix: this.OAUTH_USER_INDEX_PREFIX,
      })) ?? [];

    if (tokenKeys.length > 0) {
      await Promise.all(
        tokenKeys.map((tokenKey) =>
          this.cacheService.del(tokenKey, { prefix: this.OAUTH_TOKEN_CACHE_PREFIX }),
        ),
      );
    }

    await this.cacheService.del(userId, { prefix: this.OAUTH_USER_INDEX_PREFIX });
  }

  private getCachedCheck(accessToken: string): { registered: boolean } | null {
    const cached = this.oauthCheckCache.get(accessToken);
    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
      this.oauthCheckCache.delete(accessToken);
      return null;
    }
    return { registered: cached.registered };
  }

  private setCachedCheck(accessToken: string, registered: boolean): void {
    this.oauthCheckCache.set(accessToken, {
      registered,
      expiresAt: Date.now() + this.OAUTH_CHECK_CACHE_TTL,
    });
    // Redis에도 캐싱
    const tokenHash = this.getTokenCacheKey(accessToken);
    this.cacheService.set(`oauth_check:${tokenHash}`, { registered }, { ttl: 300 }).catch(() => undefined);
  }

  private getInFlightLookup(accessToken: string): Promise<SocialLookupResult> | null {
    const inFlight = this.lookupPromiseCache.get(accessToken);
    if (!inFlight || inFlight.expiresAt < Date.now()) {
      return null;
    }
    return inFlight.promise;
  }

  private setInFlightLookup(accessToken: string, promise: Promise<SocialLookupResult>): void {
    this.lookupPromiseCache.set(accessToken, {
      promise,
      expiresAt: Date.now() + this.LOOKUP_INFLIGHT_TTL,
    });
  }

  private clearInFlightLookup(accessToken: string): void {
    this.lookupPromiseCache.delete(accessToken);
  }

  private primeLookupCaches(accessToken: string, cacheKey: string, result: SocialLookupResult): void {
    this.setCachedCheck(accessToken, result.registered);
    // Redis/메모리 캐시는 비동기로 워밍, 실패는 무시
    this.cacheService.set(cacheKey, result, { ttl: 300 }).catch(() => undefined);
  }

  private async warmupDbConnection(): Promise<void> {
    if (this.dbWarmupPromise) {
      return this.dbWarmupPromise;
    }

    this.dbWarmupPromise = (async () => {
      try {
        const pool = await getPool();
        await pool.query('SELECT 1');
      } catch (error) {
        this.logger.warn('DB warmup skipped due to error', error as Error);
      } finally {
        this.dbWarmupPromise = null;
      }
    })();

    return this.dbWarmupPromise;
  }

  private decodeAccessToken(accessToken: string): { sub?: string; email?: string; exp?: number; name?: string; iss?: string } | null {
    try {
      const parts = accessToken.split('.');
      if (parts.length !== 3) return null;
      const payload = parts[1];
      const decoded = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      const parsed = JSON.parse(decoded) as { sub?: string; email?: string; exp?: number; name?: string; iss?: string };
      return parsed;
    } catch {
      return null;
    }
  }

  private buildAppleClientSecret() {
    // 캐시된 토큰이 있고 아직 유효하면 재사용
    if (this.appleClientSecretCache && this.appleClientSecretCache.expiresAt > Date.now()) {
      return this.appleClientSecretCache.token;
    }

    this.ensureAppleEnv();
    const privateKey = env.applePrivateKey!.replace(/\\n/g, '\n');
    const now = Math.floor(Date.now() / 1000);

    const token = jwt.sign(
      {
        iss: env.appleTeamId,
        iat: now,
        exp: now + 60 * 10, // 10분 만료
        aud: 'https://appleid.apple.com',
        sub: env.appleClientId,
      },
      privateKey,
      {
        algorithm: 'ES256',
        keyid: env.appleKeyId!,
      },
    );

    // 캐시에 저장 (9분 후 만료로 설정하여 여유 시간 확보)
    this.appleClientSecretCache = {
      token,
      expiresAt: Date.now() + (9 * 60 * 1000)
    };

    return token;
  }

  // 네트워크 요청 헬퍼 (타임아웃 포함)
  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.NETWORK_TIMEOUT);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'User-Agent': 'SseudamBackend/1.0.0',
          ...options.headers,
        }
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ServiceUnavailableException('OAuth request timeout');
      }
      throw error;
    }
  }

  async loginWithOAuthToken(
    accessToken: string,
    loginType: LoginType = 'email',
    options: OAuthTokenOptions = {},
  ): Promise<AuthSessionPayload> {
    const startTime = Date.now();

    if (!accessToken) {
      throw new UnauthorizedException('Missing Supabase access token');
    }

    // 🚀 ULTRA-FAST: 캐시된 사용자 정보 확인 (< 1ms)
    const cachedUser = await this.getCachedOAuthUser(accessToken);
    if (cachedUser) {
      this.logger.debug(`OAuth user cache hit for token ${accessToken.substring(0, 10)}...`);

      // 캐시된 사용자로 즉시 세션 생성
      const authSession = await this.authService.createAuthSession(cachedUser, loginType);

      // 백그라운드에서 캐시 워밍 (응답에 영향 없음)
      setImmediate(() => {
        this.authService.warmAuthCaches(cachedUser);
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`ULTRA-FAST OAuth login completed in ${duration}ms (cache hit)`);
      return authSession;
    }

    // ⚡ OFFLINE DECODE PATH: Supabase 네트워크 스킵, 프로필/페이로드 기반
    const decoded = this.decodeAccessToken(accessToken);
    if (decoded?.sub) {
      try {
        const profile = await this.supabaseService.findProfileById(decoded.sub);
        const emailFromProfile = profile?.email as string | undefined;
        const emailFromToken = decoded.email;
        const email = emailFromProfile ?? emailFromToken ?? '';
        if (email) {
          const userRecord: UserRecord = {
            id: profile?.id ?? decoded.sub,
            email,
            name: (profile?.name as string | null) ?? decoded.name ?? null,
            avatar_url: (profile?.avatar_url as string | null) ?? null,
            username: profile?.username ?? email.split('@')[0] ?? decoded.sub,
            password_hash: '',
            role: (profile?.role as UserRecord['role']) ?? 'user',
            created_at: profile?.created_at ? new Date(profile.created_at) : null,
            updated_at: profile?.updated_at ? new Date(profile.updated_at) : null,
          };

          const authSession = await this.authService.createAuthSession(userRecord, loginType);
          void this.setCachedOAuthUser(accessToken, userRecord);
          void this.authService.warmAuthCaches(userRecord);
          void this.verifySupabaseUser(accessToken, decoded.sub).catch(() => undefined);

          const duration = Date.now() - startTime;
          this.logger.debug(`ULTRA-FAST OAuth login via offline profile/token path in ${duration}ms`);
          return authSession;
        }
      } catch (error) {
        this.logger.warn(`Offline OAuth login path failed, falling back to Supabase`, error as Error);
      }
    }

    // 2단계: 병렬 처리로 최적화된 캐시 미스 처리
    const [supabaseUser, existingCheck] = await Promise.allSettled([
      this.supabaseService.getUserFromToken(accessToken),
      this.getCachedCheck(accessToken)
    ]);

    if (supabaseUser.status === 'rejected' || !supabaseUser.value) {
      throw new UnauthorizedException('Invalid Supabase access token');
    }

    const user = supabaseUser.value;
    const { appleRefreshToken, googleRefreshToken, authorizationCode, codeVerifier, redirectUri } = options;

    // 3단계: 프로필 존재 체크 (필수), 토큰 교환은 비동기 워밍으로 전환
    const profileExists = await this.fastProfileCheck(user.id);

    // 토큰 교환은 응답 지연을 막기 위해 시작만 해두고 백그라운드로
    const appleTokenPromise =
      loginType === 'apple' && !appleRefreshToken && authorizationCode
        ? this.exchangeAppleAuthorizationCode(authorizationCode)
        : Promise.resolve(appleRefreshToken ?? null);

    const googleTokenPromise =
      loginType === 'google' && !googleRefreshToken && authorizationCode
        ? this.exchangeGoogleAuthorizationCode(authorizationCode, { codeVerifier, redirectUri })
        : Promise.resolve(googleRefreshToken ?? null);

    // 4단계: 프로필 생성이 필요한 경우에만 처리
    if (!profileExists || (loginType !== 'email' && loginType !== 'username')) {
      // 프로필 생성을 백그라운드로 처리하지 않고 즉시 처리 (필수 작업)
      await this.supabaseService.ensureProfileFromSupabaseUser(user, loginType);
    }

    // 5단계: 사용자 객체 생성 및 캐싱
    const preferDisplayName = loginType !== 'email' && loginType !== 'username';
    const userRecord = fromSupabaseUser(user, { preferDisplayName });

    // 6단계: 세션 생성과 캐시 저장을 병렬로 처리
    const [authSession] = await Promise.all([
      this.authService.createAuthSession(userRecord, loginType),
      this.setCachedOAuthUser(accessToken, userRecord),
      this.authService.warmAuthCaches(userRecord)
    ]);

    // 🔄 새로운 로그인이므로 기존 캐시 무효화 (최신 데이터 반영)
    void this.invalidateUserCaches(userRecord.id).catch(error =>
      this.logger.warn(`Failed to invalidate caches for ${userRecord.id}:`, error)
    );

    // 7단계: 모든 백그라운드 작업을 비동기로 처리 (응답 지연 최소화)
    const backgroundTasks = [];

    // 프로필 이미지 미러링
    if (userRecord.avatar_url) {
      backgroundTasks.push(
        this.backgroundJobService.enqueue(`[social-avatar] ${userRecord.id}`, async () => {
          const mirrored = await this.supabaseService.mirrorProfileAvatar(userRecord.id, userRecord.avatar_url);
          if (mirrored) {
            userRecord.avatar_url = mirrored;
          }
        })
      );
    }

    // 토큰 저장
    backgroundTasks.push(
      this.backgroundJobService.enqueue(`[oauth-refresh-save] ${userRecord.id}`, async () => {
        const [finalAppleRefreshToken, finalGoogleRefreshToken] = await Promise.all([
          appleTokenPromise,
          googleTokenPromise,
        ]);
        if (loginType === 'apple' && finalAppleRefreshToken) {
          await this.supabaseService.saveAppleRefreshToken(userRecord.id, finalAppleRefreshToken);
        }
        if (loginType === 'google' && finalGoogleRefreshToken) {
          await this.supabaseService.saveGoogleRefreshToken(userRecord.id, finalGoogleRefreshToken);
        }
      })
    );

    // 로그인 기록
    backgroundTasks.push(
      this.backgroundJobService.enqueue(`[markLastLogin] ${userRecord.id}`, async () => {
        await this.authService.markLastLogin(userRecord.id);
      })
    );

    // 모든 백그라운드 작업을 시작 (await하지 않음)
    Promise.allSettled(backgroundTasks);

    const duration = Date.now() - startTime;
    this.logger.debug(`FAST OAuth login completed in ${duration}ms for ${userRecord.email} (optimized flow)`);

    return authSession;
  }

  async checkOAuthAccount(
    accessToken: string,
    loginType: LoginType = 'email',
  ): Promise<SocialLookupResult> {
    const startTime = Date.now();

    if (!accessToken) {
      throw new UnauthorizedException('Missing Supabase access token');
    }

    // 🚀 ULTRA-FAST: 메모리 캐시 확인 (< 1ms)
    const cachedCheck = this.getCachedCheck(accessToken);
    if (cachedCheck) {
      const duration = Date.now() - startTime;
      this.logger.debug(`⚡ ULTRA-FAST OAuth check cache hit: ${duration}ms`);
      return cachedCheck;
    }

    // 🔁 동일 토큰 중복 호출은 진행 중인 Promise 재사용
    const inFlight = this.getInFlightLookup(accessToken);
    if (inFlight) {
      const duration = Date.now() - startTime;
      this.logger.debug(`⚡ SHARED OAuth lookup (in-flight reuse): ${duration}ms`);
      return inFlight;
    }

    const lookupPromise = this.performOAuthLookup(accessToken, loginType, startTime);
    this.setInFlightLookup(accessToken, lookupPromise);

    try {
      return await lookupPromise;
    } finally {
      this.clearInFlightLookup(accessToken);
    }
  }

  private async performOAuthLookup(
    accessToken: string,
    _loginType: LoginType,
    startTime: number,
  ): Promise<SocialLookupResult> {
    // 🔥 CACHE WARMING: 토큰 해시 기반 빠른 캐시 키 생성
    const tokenHash = this.getTokenCacheKey(accessToken);
    const cacheKey = `oauth_check:${tokenHash}`;

    // DB 워밍은 블로킹하지 않고 백그라운드로
    void this.warmupDbConnection();

    // 🚀 ULTRA-FAST FIRST: 오프라인 JWT 디코딩 최우선 (Supabase 완전 스킵)
    const decoded = this.decodeAccessToken(accessToken);
    if (decoded?.sub && decoded?.iss) {
      // Supabase 토큰 형식 확인 (iss가 supabase.co를 포함하면 신뢰할 수 있음)
      const isSupabaseToken = decoded.iss && decoded.iss.includes('supabase.co');
      const isNotExpired = !decoded.exp || decoded.exp * 1000 > Date.now();

      if (isSupabaseToken && isNotExpired) {
        try {
          this.logger.debug(`🔥 OFFLINE PATH: Using JWT decode for ${decoded.sub}`);

          // 🔥 즉시 DB 확인 (Redis 병렬 처리)
          const [registered, redisCached] = await Promise.allSettled([
            this.fastProfileCheck(decoded.sub),
            this.cacheService.get<SocialLookupResult>(cacheKey)
          ]);

          // Redis 캐시가 있으면 즉시 반환
          if (redisCached.status === 'fulfilled' && redisCached.value) {
            const duration = Date.now() - startTime;
            this.logger.debug(`INSTANT OAuth check Redis hit: ${duration}ms`);
            return redisCached.value;
          }

          // DB 결과 사용 (Supabase 스킵!)
          if (registered.status === 'fulfilled') {
            const result = { registered: registered.value };
            this.primeLookupCaches(accessToken, cacheKey, result);

            // 백그라운드에서 Supabase 정밀 검증 및 사용자 캐시 워밍 (응답에 영향 없음)
            void this.verifySupabaseUser(accessToken, decoded.sub).catch((error) =>
              this.logger.warn(`Background Supabase verify failed for offline path:`, error)
            );

            const duration = Date.now() - startTime;
            this.logger.debug(`🚀 OFFLINE FAST OAuth check via JWT decode: ${duration}ms`);
            return result;
          }
        } catch (error) {
          this.logger.warn(`Offline decode path failed, falling back to Supabase:`, error);
        }
      }
    }

    // 🚀 FAST PATH: Redis 캐시와 사용자 캐시 병렬 조회
    const [redisResult, cachedUser] = await Promise.allSettled([
      this.cacheService.get<SocialLookupResult>(cacheKey),
      this.getCachedOAuthUser(accessToken)
    ]);

    // Redis 캐시 적중
    if (redisResult.status === 'fulfilled' && redisResult.value) {
      this.primeLookupCaches(accessToken, cacheKey, redisResult.value);
      const duration = Date.now() - startTime;
      this.logger.debug(`FAST OAuth check Redis hit: ${duration}ms`);
      return redisResult.value;
    }

    // 캐시된 사용자 적중 - 빠른 profile 테이블 조회
    if (cachedUser.status === 'fulfilled' && cachedUser.value) {
      try {
        const registered = await this.fastProfileCheck(cachedUser.value.id);
        const result = { registered };

        // 캐시는 즉시 반영 (두 번째 호출에서 바로 사용 가능)
        this.primeLookupCaches(accessToken, cacheKey, result);

        const duration = Date.now() - startTime;
        this.logger.debug(`FAST OAuth check with cached user + profile: ${duration}ms`);
        return result;
      } catch (error) {
        // Profile 조회 실패 시 fallback
        this.logger.warn(`Profile lookup failed for cached user:`, error);
      }
    }

    // 🔥 최후의 수단: Supabase 조회 (정확한 profile 확인)
    try {
      const supabaseUser = await this.supabaseService.getUserFromToken(accessToken);
      if (!supabaseUser || !supabaseUser.id || !supabaseUser.email) {
        throw new UnauthorizedException('Invalid Supabase access token');
      }

      // 🚀 실제 profile 테이블 확인 (정확한 등록 여부)
      const registered = await this.fastProfileCheck(supabaseUser.id);
      const result = { registered };

      // 캐시를 즉시 워밍 (메모리 + Redis)
      this.primeLookupCaches(accessToken, cacheKey, result);

      // 백그라운드에서 사용자 정보 캐싱 (다음 요청 최적화)
      void this.setCachedOAuthUser(accessToken, {
        id: supabaseUser.id,
        email: supabaseUser.email || '',
        name: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || null,
        avatar_url: supabaseUser.user_metadata?.avatar_url || null,
        username: supabaseUser.email || supabaseUser.id,
        password_hash: '',
        role: 'user',
        created_at: new Date(),
        updated_at: new Date(),
      }).catch((error) => {
        this.logger.warn(`Background OAuth caching failed:`, error);
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`OAuth check completed: ${duration}ms (registered: ${result.registered})`);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`OAuth check failed after ${duration}ms:`, error);
      throw new UnauthorizedException('Invalid Supabase access token');
    }
  }

  private async verifySupabaseUser(accessToken: string, userId: string): Promise<void> {
    try {
      const supabaseUser = await this.supabaseService.getUserFromToken(accessToken);
      if (!supabaseUser || supabaseUser.id !== userId) {
        this.setCachedCheck(accessToken, false);
        await this.cacheService.set(`oauth_check:${this.getTokenCacheKey(accessToken)}`, { registered: false }, { ttl: 120 });
        return;
      }

      await this.setCachedOAuthUser(accessToken, {
        id: supabaseUser.id,
        email: supabaseUser.email || '',
        name: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || null,
        avatar_url: supabaseUser.user_metadata?.avatar_url || null,
        username: supabaseUser.email || supabaseUser.id,
        password_hash: '',
        role: 'user',
        created_at: new Date(),
        updated_at: new Date(),
      });
    } catch (error) {
      this.logger.warn(`verifySupabaseUser failed for ${userId}:`, error);
    }
  }

  async revokeAppleConnection(userId: string, refreshToken?: string): Promise<void> {
    try {
      const tokenToUse =
        refreshToken ??
        (await this.supabaseService.getAppleRefreshToken(userId)) ??
        null;

      if (!tokenToUse) {
        this.logger.warn(`[revokeAppleConnection] No Apple refresh token found for user ${userId}, skipping revoke`);
        return; // 토큰이 없으면 조용히 종료 (이미 연결 해제된 상태)
      }

      this.ensureAppleEnv();
      const clientSecret = this.buildAppleClientSecret();

      const body = new URLSearchParams({
        token: tokenToUse,
        token_type_hint: 'refresh_token',
        client_id: env.appleClientId!,
        client_secret: clientSecret,
      });

      // 타임아웃 추가 (8초)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch('https://appleid.apple.com/auth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text();
        this.logger.warn(`[revokeAppleConnection] Apple revoke failed: ${response.status} ${text}`);
        // 계정 삭제 시에는 Apple 연결 해제 실패해도 계속 진행
        return;
      }

      // 성공 시에만 토큰 삭제
      await this.supabaseService.saveAppleRefreshToken(userId, null);
      await this.invalidateOAuthCacheByUser(userId);
      this.logger.debug(`[revokeAppleConnection] Successfully revoked Apple connection for user ${userId}`);
    } catch (error) {
      // Apple 연결 해제 실패는 로그만 남기고 계정 삭제는 계속 진행
      this.logger.warn(`[revokeAppleConnection] Failed to revoke Apple connection for user ${userId}:`, error);
      return;
    }
  }

  async revokeGoogleConnection(userId: string, refreshToken?: string): Promise<void> {
    try {
      const tokenToUse =
        refreshToken ??
        (await this.supabaseService.getGoogleRefreshToken(userId)) ??
        null;

      if (!tokenToUse) {
        this.logger.warn(`[revokeGoogleConnection] No Google refresh token found for user ${userId}, skipping revoke`);
        return; // 토큰이 없으면 조용히 종료 (이미 연결 해제된 상태)
      }

      this.ensureGoogleEnv();

      const body = new URLSearchParams({
        token: tokenToUse,
        client_id: env.googleClientId!,
        client_secret: env.googleClientSecret!,
      });

      // 타임아웃 추가 (8초)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text();
        this.logger.warn(`[revokeGoogleConnection] Google revoke failed: ${response.status} ${text}`);
        // 계정 삭제 시에는 Google 연결 해제 실패해도 계속 진행
        return;
      }

      // 성공 시에만 토큰 삭제
      await this.supabaseService.saveGoogleRefreshToken(userId, null);
      await this.invalidateOAuthCacheByUser(userId);
      this.logger.debug(`[revokeGoogleConnection] Successfully revoked Google connection for user ${userId}`);
    } catch (error) {
      // Google 연결 해제 실패는 로그만 남기고 계정 삭제는 계속 진행
      this.logger.warn(`[revokeGoogleConnection] Failed to revoke Google connection for user ${userId}:`, error);
      return;
    }
  }

  private resolveGoogleRedirectUri(override?: string | null): string {
    const resolved = override ?? env.googleRedirectUri;
    if (!resolved) {
      throw new ServiceUnavailableException('Google redirect URI is not configured');
    }
    return resolved;
  }

  private async exchangeAppleAuthorizationCode(code: string): Promise<string> {
    const cacheKey = `apple-${code}`;

    // 중복 요청 방지: 동일한 코드로 진행 중인 요청이 있으면 재사용
    const existingPromise = this.tokenExchangePromises.get(cacheKey);
    if (existingPromise) {
      return existingPromise;
    }

    const exchangePromise = this._exchangeAppleAuthorizationCode(code);
    this.tokenExchangePromises.set(cacheKey, exchangePromise);

    try {
      const result = await exchangePromise;
      return result;
    } finally {
      // 요청 완료 후 캐시에서 제거
      this.tokenExchangePromises.delete(cacheKey);
    }
  }

  private async _exchangeAppleAuthorizationCode(code: string): Promise<string> {
    this.ensureAppleEnv();
    const clientSecret = this.buildAppleClientSecret();
    const body = new URLSearchParams({
      client_id: env.appleClientId!,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    });

    const response = await this.fetchWithTimeout('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ServiceUnavailableException(`Apple token exchange failed: ${response.status} ${text}`);
    }
    const result = (await response.json()) as { refresh_token?: string };
    if (!result.refresh_token) {
      throw new ServiceUnavailableException('Apple did not return a refresh_token');
    }
    return result.refresh_token;
  }

  private async exchangeGoogleAuthorizationCode(
    code: string,
    options: { codeVerifier?: string | null; redirectUri?: string | null } = {},
  ): Promise<string> {
    const cacheKey = `google-${code}-${options.codeVerifier || 'default'}`;

    // 중복 요청 방지
    const existingPromise = this.tokenExchangePromises.get(cacheKey);
    if (existingPromise) {
      return existingPromise;
    }

    const exchangePromise = this._exchangeGoogleAuthorizationCode(code, options);
    this.tokenExchangePromises.set(cacheKey, exchangePromise);

    try {
      const result = await exchangePromise;
      return result;
    } finally {
      this.tokenExchangePromises.delete(cacheKey);
    }
  }

  private async _exchangeGoogleAuthorizationCode(
    code: string,
    options: { codeVerifier?: string | null; redirectUri?: string | null } = {},
  ): Promise<string> {
    this.ensureGoogleEnv();
    const body = new URLSearchParams({
      client_id: env.googleClientId!,
      client_secret: env.googleClientSecret!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.resolveGoogleRedirectUri(options.redirectUri),
    });

    if (options.codeVerifier) {
      body.set('code_verifier', options.codeVerifier);
    }

    const response = await this.fetchWithTimeout('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ServiceUnavailableException(`Google token exchange failed: ${response.status} ${text}`);
    }

    const result = (await response.json()) as { refresh_token?: string };
    if (!result.refresh_token) {
      throw new ServiceUnavailableException('Google did not return a refresh_token');
    }
    return result.refresh_token;
  }

  /**
   * 🚀 REDIS-FIRST: DB 커넥션 워밍 및 Redis 캐시 적극 활용
   */
  private async warmupDbConnection(): Promise<boolean> {
    try {
      const { getPool } = await import('../../db/pool');
      const pool = await getPool();
      await pool.query('SELECT 1'); // DB 커넥션 워밍
      return true;
    } catch (error) {
      this.logger.warn('DB connection warmup failed:', error);
      return false;
    }
  }

  /**
   * 🚀 ULTRA-FAST: Profile 존재 여부만 Redis-first로 초고속 확인
   */
  private async fastProfileCheck(userId: string): Promise<boolean> {
    const cacheKey = `profile_exists:${userId}`;

    try {
      // 1. Redis에서 먼저 확인 (TTL 10분)
      const cached = await this.cacheService.get<boolean>(cacheKey);
      if (cached !== null) {
        return cached;
      }

      // 2. DB에서 빠른 확인 (EXISTS 쿼리)
      const { getPool } = await import('../../db/pool');
      const pool = await getPool();
      const result = await pool.query(
        'SELECT EXISTS(SELECT 1 FROM profiles WHERE id = $1) as exists',
        [userId]
      );

      const exists = Boolean(result.rows[0]?.exists);

      // 3. Redis에 즉시 캐싱 (10분 TTL)
      await this.cacheService.set(cacheKey, exists, { ttl: 600 });

      return exists;
    } catch (error) {
      this.logger.warn(`Fast profile check failed for ${userId}:`, error);
      return false; // 실패 시 안전한 기본값
    }
  }

  /**
   * 📊 SMART CACHE: 사용자 데이터 업데이트 시 관련 캐시 모두 무효화
   */
  async invalidateUserCaches(userId: string): Promise<void> {
    try {
      await Promise.allSettled([
        // OAuth 관련 캐시 무효화
        this.cacheService.del(`profile_exists:${userId}`),
        this.cacheService.del(`oauth_user:${userId}`),

        // 프로필 존재 여부 캐시 무효화
        this.cacheService.del(userId, { prefix: this.PROFILE_EXISTS_REDIS_PREFIX }),

        // OAuth 캐시 무효화
        this.invalidateOAuthCacheByUser(userId),

        // 메모리 캐시 정리
        Promise.resolve(this.profileExistenceCache.delete(userId)),
      ]);
    } catch (error) {
      this.logger.warn(`Cache invalidation failed for user ${userId}:`, error);
    }
  }
}
