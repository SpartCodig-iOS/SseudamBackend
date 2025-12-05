import { createHash } from 'node:crypto';
import { Injectable, ServiceUnavailableException, UnauthorizedException, BadRequestException, Inject, forwardRef, Logger } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { LoginType } from '../../types/auth';
import { UserRecord } from '../../types/user';
import { SupabaseService } from '../../services/supabaseService';
import { OAuthTokenService } from '../../services/oauth-token.service';
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
  kakaoRefreshToken?: string | null;
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
  private readonly OAUTH_CHECK_CACHE_TTL = 15 * 60 * 1000; // 15분으로 늘려서 재사용률 향상
  private readonly LOOKUP_INFLIGHT_TTL = 5 * 1000; // 동일 토큰 연속 호출 병합용 (5초)
  private readonly PROFILE_EXISTS_TTL = 10 * 60 * 1000; // 10분 (프로필 존재 여부는 거의 변하지 않음)
  private readonly PROFILE_EXISTS_REDIS_TTL = 30 * 60; // 30분
  private readonly PROFILE_EXISTS_REDIS_PREFIX = 'profile_exists';
  private readonly localTokenCache = new Map<string, { user: UserRecord; expiresAt: number }>();
  private readonly LOCAL_TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5분
  private readonly KAKAO_TIMEOUT = 8000; // 8초
  private readonly DEFAULT_KAKAO_REDIRECT = 'https://sseudam.up.railway.app/api/v1/oauth/kakao/callback';
  private dbWarmupPromise: Promise<boolean> | null = null;

  // 네트워크 타임아웃 설정 (빠른 실패)
  private readonly NETWORK_TIMEOUT = 8000; // 8초

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly oauthTokenService: OAuthTokenService,
    private readonly cacheService: CacheService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly backgroundJobService: BackgroundJobService,
  ) {}

  private uuidFromProvider(provider: string, externalId: string): string {
    const hash = createHash('sha1').update(`${provider}:${externalId}`).digest('hex');
    return [
      hash.substring(0, 8),
      hash.substring(8, 12),
      hash.substring(12, 16),
      hash.substring(16, 20),
      hash.substring(20, 32),
    ].join('-');
  }

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

  private ensureKakaoEnv() {
    if (!env.kakaoClientId && !env.kakaoRedirectUri) {
      throw new ServiceUnavailableException('Kakao credentials are not configured');
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

  // Kakao 토큰 교환 (authorization_code -> access/refresh)
  async exchangeKakaoAuthorizationCode(
    authorizationCode: string,
    options?: { redirectUri?: string; codeVerifier?: string },
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    this.ensureKakaoEnv();

    // redirect URI는 고정 값 사용 (env 없이 하드코딩)
    const finalRedirect = this.DEFAULT_KAKAO_REDIRECT;
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: env.kakaoClientId ?? '',
      redirect_uri: finalRedirect,
      code: authorizationCode,
    });
    if (options?.codeVerifier) {
      body.append('code_verifier', options.codeVerifier);
    }
    if (env.kakaoClientSecret) {
      body.append('client_secret', env.kakaoClientSecret);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.KAKAO_TIMEOUT);

    const response = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      const text = await response.text();
      throw new ServiceUnavailableException(`Kakao token exchange failed: ${response.status} ${text}`);
    }

    const payload = await response.json() as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    if (!payload.access_token || !payload.refresh_token) {
      throw new ServiceUnavailableException('Kakao did not return access/refresh token');
    }

    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresIn: payload.expires_in ?? 0,
    };
  }

  // Kakao refresh_token -> access_token
  async refreshKakaoAccessToken(refreshToken: string): Promise<string | null> {
    this.ensureKakaoEnv();

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env.kakaoClientId!,
      refresh_token: refreshToken,
    });
    if (env.kakaoClientSecret) {
      body.append('client_secret', env.kakaoClientSecret);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.KAKAO_TIMEOUT);

    const response = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      return null;
    }

    const payload = await response.json() as { access_token?: string };
    return payload.access_token ?? null;
  }

  async revokeKakaoConnection(userId: string, refreshToken?: string): Promise<void> {
    try {
      const tokenToUse = refreshToken ?? (await this.oauthTokenService.getToken(userId, 'kakao')) ?? null;
      if (!tokenToUse) {
        this.logger.warn(`[revokeKakaoConnection] No Kakao refresh token for user ${userId}, skipping`);
        return;
      }

      const accessToken = await this.refreshKakaoAccessToken(tokenToUse);
      if (!accessToken) {
        this.logger.warn(`[revokeKakaoConnection] Failed to refresh Kakao access token for user ${userId}, skipping unlink`);
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.KAKAO_TIMEOUT);

      const response = await fetch('https://kapi.kakao.com/v1/user/unlink', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        const text = await response.text();
        this.logger.warn(`[revokeKakaoConnection] Kakao unlink failed: ${response.status} ${text}`);
      }

      // 성공/실패와 무관하게 토큰은 삭제
      await this.oauthTokenService.saveToken(userId, 'kakao', null);
      await this.invalidateOAuthCacheByUser(userId);
    } catch (error) {
      this.logger.warn(`[revokeKakaoConnection] Failed to revoke Kakao connection for user ${userId}:`, error);
    }
  }

  private async getKakaoProfile(accessToken: string): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.KAKAO_TIMEOUT);

    const response = await fetch('https://kapi.kakao.com/v2/user/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      const text = await response.text();
      throw new UnauthorizedException(`Failed to fetch Kakao profile: ${response.status} ${text}`);
    }

    return response.json();
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
    this.cacheService.set(`oauth_check:${tokenHash}`, { registered }, { ttl: 900 }).catch(() => undefined); // 15분으로 연장
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
    this.cacheService.set(cacheKey, result, { ttl: 900 }).catch(() => undefined); // 15분
  }

  /**
   * 🚀 REDIS-FIRST: DB 커넥션 워밍 (중복 요청은 재사용)
   */
  private async warmupDbConnection(): Promise<boolean> {
    if (this.dbWarmupPromise) {
      await this.dbWarmupPromise;
      return true;
    }

    this.dbWarmupPromise = (async () => {
      try {
        const pool = await getPool();
        await pool.query('SELECT 1');
        return true;
      } catch (error) {
        this.logger.warn('DB warmup skipped due to error', error as Error);
        return false;
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

  private resolveLoginType(requested: LoginType = 'email', supabaseUser?: any): LoginType {
    const provider =
      supabaseUser?.app_metadata?.provider ??
      supabaseUser?.identities?.[0]?.provider ??
      supabaseUser?.user_metadata?.provider;

    if (provider === 'google' || provider === 'apple' || provider === 'kakao') {
      return provider;
    }

    if (requested && requested !== 'email' && requested !== 'username') {
      return requested;
    }

    return requested ?? 'email';
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
  ): Promise<AuthSessionPayload & { registered?: boolean; loginFlow?: 'login' | 'signup' }> {
    // Kakao: authorizationCode + codeVerifier 필수 (refresh/unlink까지 확실히 처리)
    if (loginType === 'kakao') {
      if (!options.authorizationCode || !options.codeVerifier) {
        throw new UnauthorizedException('Kakao login requires authorizationCode and codeVerifier');
      }

      const code = options.authorizationCode;
      const exchanged = await this.exchangeKakaoAuthorizationCode(code, {
        codeVerifier: options.codeVerifier ?? undefined,
      });
      const kakaoAccessToken = exchanged.accessToken;
      const kakaoRefreshToken = exchanged.refreshToken;

      const profile = await this.getKakaoProfile(kakaoAccessToken);
      const kakaoId = profile?.id?.toString();
      if (!kakaoId) {
        throw new UnauthorizedException('Kakao profile id not found');
      }
      const userId = this.uuidFromProvider('kakao', kakaoId);
      const email = profile?.kakao_account?.email ?? null;
      const nickname = profile?.kakao_account?.profile?.nickname ?? null;
      const avatarUrl = profile?.kakao_account?.profile?.profile_image_url ?? null;

      const userRecord: UserRecord = {
        id: userId,
        email: email ?? '',
        name: nickname ?? null,
        avatar_url: avatarUrl ?? null,
        username: email ?? kakaoId,
        created_at: new Date(),
        updated_at: new Date(),
        password_hash: '',
        role: 'user',
      };

      const profileExists = await this.fastProfileCheck(userId);

      await this.supabaseService.upsertProfile({
        id: userRecord.id,
        email: userRecord.email,
        name: userRecord.name ?? userRecord.email ?? userRecord.id,
        username: userRecord.username,
        loginType: 'kakao',
        avatarUrl: userRecord.avatar_url,
      });

      if (kakaoRefreshToken) {
        await this.oauthTokenService.saveToken(userRecord.id, 'kakao', kakaoRefreshToken);
      }

      const session = await this.authService.createAuthSession(userRecord, 'kakao');
      const loginFlow: 'login' | 'signup' = profileExists ? 'login' : 'signup';
      return { ...session, registered: profileExists, loginFlow };
    }

    const startTime = Date.now();
    const marks: string[] = [];
    const mark = (label: string) => {
      marks.push(`${label}:${Date.now() - startTime}ms`);
    };

    if (!accessToken) {
      throw new UnauthorizedException('Missing Supabase access token');
    }

    // 🚀 ULTRA-FAST: 캐시된 사용자 정보 확인 (< 1ms)
    const cachedUser = await this.getCachedOAuthUser(accessToken);
    if (cachedUser) {
      // this.logger.debug(`OAuth user cache hit for token ${accessToken.substring(0, 10)}...`);
      const resolvedLoginType = this.resolveLoginType(loginType);
      let userForSession = cachedUser;
      const needsProfileHydration = !cachedUser.name || !cachedUser.avatar_url;

      // 캐시에 충분한 프로필이 있으면 Supabase 네트워크 호출을 생략해 응답 지연을 줄임
      if (needsProfileHydration) {
    try {
      const supabaseUser = await this.supabaseService.getUserFromToken(accessToken);
      const detectedLoginType = this.resolveLoginType(resolvedLoginType, supabaseUser);
      await this.supabaseService.ensureProfileFromSupabaseUser(supabaseUser, detectedLoginType);
      userForSession = fromSupabaseUser(supabaseUser, {
            preferDisplayName: detectedLoginType !== 'email' && detectedLoginType !== 'username',
          });
          await this.setCachedOAuthUser(accessToken, userForSession);
          // 소셜 리프레시 토큰 저장/교환도 병렬 처리
          const [finalAppleRefreshToken, finalGoogleRefreshToken] = await Promise.all([
            detectedLoginType === 'apple' && !options.appleRefreshToken && options.authorizationCode
              ? this.exchangeAppleAuthorizationCode(options.authorizationCode)
              : Promise.resolve(options.appleRefreshToken ?? null),
            detectedLoginType === 'google' && !options.googleRefreshToken && options.authorizationCode
              ? this.exchangeGoogleAuthorizationCode(options.authorizationCode, {
                  codeVerifier: options.codeVerifier,
                  redirectUri: options.redirectUri,
                })
              : Promise.resolve(options.googleRefreshToken ?? null),
          ]);
          if (detectedLoginType === 'apple' && finalAppleRefreshToken) {
            await this.oauthTokenService.saveToken(userForSession.id, 'apple', finalAppleRefreshToken);
          }
          if (detectedLoginType === 'google' && finalGoogleRefreshToken) {
            await this.oauthTokenService.saveToken(userForSession.id, 'google', finalGoogleRefreshToken);
          }
        } catch (error) {
          this.logger.warn(`Cache-hit profile refresh skipped: ${error instanceof Error ? error.message : error}`);
        }
      } else if ((resolvedLoginType === 'apple' || resolvedLoginType === 'google') && options.authorizationCode) {
        // 프로필은 캐시로 충분하지만 auth code가 왔으면 리프레시 토큰 교환만 백그라운드로 처리
        const exchangePromise = resolvedLoginType === 'apple'
          ? this.exchangeAppleAuthorizationCode(options.authorizationCode)
          : this.exchangeGoogleAuthorizationCode(options.authorizationCode, {
            codeVerifier: options.codeVerifier,
            redirectUri: options.redirectUri,
          });

        exchangePromise
          .then((refreshToken) => {
            if (resolvedLoginType === 'apple') {
              return this.oauthTokenService.saveToken(userForSession.id, 'apple', refreshToken);
            }
            return this.oauthTokenService.saveToken(userForSession.id, 'google', refreshToken);
          })
          .catch((error) => {
            this.logger.warn(`Background social token exchange failed for cached user ${userForSession.id}: ${error instanceof Error ? error.message : error}`);
          });
      }

      const authSession = await this.authService.createAuthSession(userForSession, resolvedLoginType);
      mark('cache-hit-complete');

      // 백그라운드에서 캐시 워밍 (응답에 영향 없음)
      setImmediate(() => {
        this.authService.warmAuthCaches(userForSession);
      });

      const duration = Date.now() - startTime;
      if (duration > 1200) {
        this.logger.warn(`[OAuthPerf][cache-hit] ${duration}ms steps=${marks.join(' | ')}`);
      }
      // this.logger.debug(`ULTRA-FAST OAuth login completed in ${duration}ms (cache hit)`);
      return authSession;
    }

    // ⚡ OFFLINE DECODE PATH: Supabase 네트워크 스킵, 프로필/페이로드 기반
    const decoded = this.decodeAccessToken(accessToken);
    if (decoded?.sub) {
      try {
        const userId = decoded.sub as string;
        // 캐시 우선으로 프로필 스냅샷 확보 (created_at/updated_at 포함)
        const cachedProfile = await this.cacheService.get<UserRecord>(`profile:${userId}`).catch(() => null);
        const profile = cachedProfile ?? await this.supabaseService.findProfileById(userId);
        const email = profile?.email ?? decoded.email ?? '';

        // 이메일이 없으면 정상 세션 생성이 어려우므로 네트워크 경로로 폴백
        if (email) {
          const detectedLoginType = this.resolveLoginType(loginType);

          const userRecord: UserRecord = {
            id: profile?.id ?? userId,
            email,
            name: (profile?.name as string | null) ?? decoded.name ?? null,
            avatar_url: (profile?.avatar_url as string | null) ?? null,
            username: profile?.username ?? email.split('@')[0] ?? userId,
            password_hash: '',
            role: (profile?.role as UserRecord['role']) ?? 'user',
            created_at: profile?.created_at ? new Date(profile.created_at) : null,
            updated_at: profile?.updated_at ? new Date(profile.updated_at) : null,
          };

          // 프로필을 캐시에 채워 넣어 후속 요청 가속
          if (profile && !cachedProfile) {
            void this.cacheService.set(`profile:${userId}`, profile, { ttl: 600 }).catch(() => undefined);
          }

          // 세션 즉시 생성
          const authSession = await this.authService.createAuthSession(userRecord, detectedLoginType);
          void this.setCachedOAuthUser(accessToken, userRecord);
          mark('offline-session');
          void this.authService.warmAuthCaches(userRecord);

          // 느린 작업(프로필 보강/리프레시 토큰 저장)은 백그라운드로 실행
          setImmediate(async () => {
            try {
              const supabaseUser = await this.supabaseService.getUserById(userId);
              await this.supabaseService.ensureProfileFromSupabaseUser(supabaseUser, detectedLoginType);
              const appleTokenFromUser = (supabaseUser?.user_metadata as any)?.apple_refresh_token ?? null;
              const googleTokenFromUser = (supabaseUser?.user_metadata as any)?.google_refresh_token ?? null;

              if (detectedLoginType === 'apple') {
                const token =
                  options.appleRefreshToken ??
                  appleTokenFromUser ??
                  (options.authorizationCode
                    ? await this.exchangeAppleAuthorizationCode(options.authorizationCode)
                    : null);
                if (token) {
                  await this.oauthTokenService.saveToken(userRecord.id, 'apple', token);
                }
              } else if (detectedLoginType === 'google') {
                const token =
                  options.googleRefreshToken ??
                  googleTokenFromUser ??
                  (options.authorizationCode
                    ? await this.exchangeGoogleAuthorizationCode(options.authorizationCode, {
                        codeVerifier: options.codeVerifier,
                        redirectUri: options.redirectUri,
                      })
                    : null);
                if (token) {
                  await this.oauthTokenService.saveToken(userRecord.id, 'google', token);
                }
              }
            } catch (error) {
              this.logger.warn(`[offline-path][bg] ensure profile/token failed for ${userId}:`, error as Error);
            }
          });

          const duration = Date.now() - startTime;
          if (duration > 1200) {
            this.logger.warn(`[OAuthPerf][offline-path] ${duration}ms steps=${marks.join(' | ')}`);
          }
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
    mark('supabase-getUserFromToken');
    const resolvedLoginType = this.resolveLoginType(loginType, user);
    const { appleRefreshToken, googleRefreshToken, authorizationCode, codeVerifier, redirectUri } = options;

    // 3단계: 프로필 존재 체크와 토큰 교환을 병렬로 실행
    const [profileExists, appleTokenPromise, googleTokenPromise] = await Promise.all([
      this.fastProfileCheck(user.id),
      resolvedLoginType === 'apple' && !appleRefreshToken && authorizationCode
        ? this.exchangeAppleAuthorizationCode(authorizationCode)
        : Promise.resolve(appleRefreshToken ?? null),
      resolvedLoginType === 'google' && !googleRefreshToken && authorizationCode
        ? this.exchangeGoogleAuthorizationCode(authorizationCode, { codeVerifier, redirectUri })
        : Promise.resolve(googleRefreshToken ?? null)
    ]);

    // 4단계: 프로필 생성이 필요한 경우에만 처리
    if (!profileExists || (resolvedLoginType !== 'email' && resolvedLoginType !== 'username')) {
      // 프로필 생성을 백그라운드로 처리하지 않고 즉시 처리 (필수 작업)
      await this.supabaseService.ensureProfileFromSupabaseUser(user, resolvedLoginType);
      mark('ensureProfile');
    }

    // 5단계: 사용자 객체 생성 및 캐싱
    const preferDisplayName = resolvedLoginType !== 'email' && resolvedLoginType !== 'username';
    const userRecord = fromSupabaseUser(user, { preferDisplayName });

    // 6단계: 세션 생성과 캐시 저장을 병렬로 처리
    const [authSession] = await Promise.all([
      this.authService.createAuthSession(userRecord, resolvedLoginType),
      this.setCachedOAuthUser(accessToken, userRecord),
      this.authService.warmAuthCaches(userRecord)
    ]);
    mark('session-created');

    // 🔄 새로운 로그인이므로 기존 캐시 무효화 (최신 데이터 반영)
    void this.invalidateUserCaches(userRecord.id).catch(error =>
      this.logger.warn(`Failed to invalidate caches for ${userRecord.id}:`, error)
    );

    // 7단계: 리프레시 토큰 저장 (이미 병렬로 받아온 결과 사용)
            if (resolvedLoginType === 'apple' && appleTokenPromise) {
              await this.oauthTokenService.saveToken(userRecord.id, 'apple', appleTokenPromise);
            }
            if (resolvedLoginType === 'google' && googleTokenPromise) {
              await this.oauthTokenService.saveToken(userRecord.id, 'google', googleTokenPromise);
            }

    // 나머지 부가 작업은 백그라운드로 실행
    const backgroundTasks = [];
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
    backgroundTasks.push(
      this.backgroundJobService.enqueue(`[markLastLogin] ${userRecord.id}`, async () => {
        await this.authService.markLastLogin(userRecord.id);
      })
    );
    Promise.allSettled(backgroundTasks);

    const duration = Date.now() - startTime;
    if (duration > 1200) {
      this.logger.warn(`[OAuthPerf][miss] ${duration}ms steps=${marks.join(' | ')}`);
    }
    // this.logger.debug(`FAST OAuth login completed in ${duration}ms for ${userRecord.email} (optimized flow)`);

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
      // this.logger.debug(`⚡ ULTRA-FAST OAuth check cache hit: ${duration}ms`);
      return cachedCheck;
    }

    // 🔁 동일 토큰 중복 호출은 진행 중인 Promise 재사용
    const inFlight = this.getInFlightLookup(accessToken);
    if (inFlight) {
      const duration = Date.now() - startTime;
      // this.logger.debug(`⚡ SHARED OAuth lookup (in-flight reuse): ${duration}ms`);
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

  async checkKakaoAccountWithCode(
    authorizationCode: string,
    options: { codeVerifier?: string; redirectUri?: string } = {},
  ): Promise<SocialLookupResult> {
    const { accessToken: kakaoAccessToken } = await this.exchangeKakaoAuthorizationCode(authorizationCode, {
      codeVerifier: options.codeVerifier,
      redirectUri: options.redirectUri,
    });
    const profile = await this.getKakaoProfile(kakaoAccessToken);
    const kakaoId = profile?.id?.toString();
    if (!kakaoId) {
      throw new UnauthorizedException('Kakao profile id not found');
    }

    const registered = await this.fastProfileCheck(kakaoId);
    return { registered };
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
          // this.logger.debug(`🔥 OFFLINE PATH: Using JWT decode for ${decoded.sub}`);

          // 🔥 즉시 DB 확인 (Redis 병렬 처리)
          const [registered, redisCached] = await Promise.allSettled([
            this.fastProfileCheck(decoded.sub),
            this.cacheService.get<SocialLookupResult>(cacheKey)
          ]);

          // Redis 캐시가 있으면 즉시 반환
          if (redisCached.status === 'fulfilled' && redisCached.value) {
            const duration = Date.now() - startTime;
            // this.logger.debug(`INSTANT OAuth check Redis hit: ${duration}ms`);
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
            // this.logger.debug(`🚀 OFFLINE FAST OAuth check via JWT decode: ${duration}ms`);
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
      // this.logger.debug(`FAST OAuth check Redis hit: ${duration}ms`);
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
        // this.logger.debug(`FAST OAuth check with cached user + profile: ${duration}ms`);
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
      // this.logger.debug(`OAuth check completed: ${duration}ms (registered: ${result.registered})`);

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
        await this.cacheService.set(`oauth_check:${this.getTokenCacheKey(accessToken)}`, { registered: false }, { ttl: 300 });
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
        (await this.oauthTokenService.getToken(userId, 'apple')) ??
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
      await this.oauthTokenService.saveToken(userId, 'apple', null);
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
        (await this.oauthTokenService.getToken(userId, 'google')) ??
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
      await this.oauthTokenService.saveToken(userId, 'google', null);
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

      // 3. Redis에 즉시 캐싱 (30분 TTL로 늘려서 재사용률 향상)
      await this.cacheService.set(cacheKey, exists, { ttl: 1800 });

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
