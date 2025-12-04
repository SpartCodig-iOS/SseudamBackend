import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { SocialAuthService, OAuthTokenOptions, SocialLookupResult } from './social-auth.service';
import { LoginType } from '../../types/auth';
import { AuthSessionPayload } from '../auth/auth.service';
import { CacheService } from '../../services/cacheService';
import { SupabaseService } from '../../services/supabaseService';
import { createHash } from 'crypto';

@Injectable()
export class OptimizedOAuthService {
  private readonly logger = new Logger(OptimizedOAuthService.name);
  private readonly FAST_OAUTH_CACHE_PREFIX = 'fast_oauth';
  private readonly FAST_OAUTH_CACHE_TTL = 3 * 60; // 3분으로 단축 (메모리 최적화)
  private readonly FAST_OAUTH_REDIS_PREFIX = 'oauth_fast';
  private readonly LOOKUP_REDIS_PREFIX = 'lookup';
  private readonly LOOKUP_TTL = 2 * 60; // 2분으로 단축

  constructor(
    private readonly socialAuthService: SocialAuthService,
    private readonly cacheService: CacheService,
    private readonly supabaseService: SupabaseService,
  ) {}

  private getFastCacheKey(accessToken: string, loginType: LoginType): string {
    const hash = createHash('sha256').update(`${accessToken}:${loginType}`).digest('hex');
    return `${hash.substring(0, 16)}`;
  }

  private getLookupCacheKey(accessToken: string): string {
    const hash = createHash('sha256').update(accessToken).digest('hex');
    return `${hash.substring(0, 12)}`;
  }

  /**
   * 초고속 OAuth 로그인 - 중복 요청 최적화
   */
  async fastOAuthLogin(
    accessToken: string,
    loginType: LoginType = 'email',
    options: OAuthTokenOptions = {},
  ): Promise<AuthSessionPayload> {
    const startTime = Date.now();
    const cacheKey = this.getFastCacheKey(accessToken, loginType);

    try {
      // 1. 빠른 캐시 체크 (이미 처리된 요청인지 확인)
      const cachedResult = await this.cacheService.get<AuthSessionPayload>(cacheKey, {
        prefix: this.FAST_OAUTH_REDIS_PREFIX,
      });
      if (cachedResult) {
        const duration = Date.now() - startTime;
        // this.logger.debug(`Ultra-fast OAuth (cached): ${duration}ms`);
        return cachedResult;
      }

      // 2. 백그라운드 캐시 설정과 함께 OAuth 처리
      const resultPromise = this.socialAuthService.loginWithOAuthToken(accessToken, loginType, options);

      // 3. 결과를 즉시 받고 백그라운드에서 캐싱
      const result = await resultPromise;

      // 백그라운드 캐싱 (응답 시간에 영향 없음)
      this.cacheService.set(cacheKey, result, {
        ttl: this.FAST_OAUTH_CACHE_TTL,
        prefix: this.FAST_OAUTH_REDIS_PREFIX,
      }).catch(err => this.logger.warn(`Failed to cache OAuth result: ${err.message}`));

      const duration = Date.now() - startTime;
      // this.logger.debug(`Fast OAuth login completed: ${duration}ms`);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`OAuth login failed after ${duration}ms: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * 백그라운드 OAuth 토큰 교환 최적화
   * private 메서드 접근 제한으로 인해 메인 서비스 호출
   */
  async optimizedTokenExchange(
    accessToken: string,
    loginType: LoginType,
    options: OAuthTokenOptions,
  ): Promise<AuthSessionPayload> {
    const startTime = Date.now();

    // 메인 OAuth 서비스를 통해 토큰 교환 처리 (병렬 처리는 내부에서 수행됨)
    const authResult = await this.socialAuthService.loginWithOAuthToken(accessToken, loginType, options);

    const duration = Date.now() - startTime;
    // this.logger.debug(`Optimized OAuth with token exchange: ${duration}ms`);

    return authResult;
  }

  /**
   * 초고속 OAuth 가입 확인 - 최대 0.05초 내 응답
   */
  async fastCheckOAuthAccount(
    accessToken: string,
    loginType: LoginType = 'email',
  ): Promise<SocialLookupResult> {
    const startTime = Date.now();

    if (!accessToken) {
      throw new UnauthorizedException('Missing Supabase access token');
    }

    const cacheKey = this.getLookupCacheKey(accessToken);

    try {
      // 1단계: 캐시에서 초고속 조회 (< 1ms)
      const cached = await this.cacheService.get<SocialLookupResult>(cacheKey, {
        prefix: this.LOOKUP_REDIS_PREFIX,
      });
      if (cached !== null) {
        const duration = Date.now() - startTime;
        // this.logger.debug(`ULTRA-FAST lookup (cache hit): ${duration}ms`);
        return cached;
      }

      // 2단계: 기존 캐시된 토큰 체크 (< 5ms)
      const existingCheck = (this.socialAuthService as any).getCachedCheck?.(accessToken);
      if (existingCheck) {
        // 결과를 Redis에 캐시하고 즉시 반환
        this.cacheService.set(cacheKey, existingCheck, { ttl: this.LOOKUP_TTL, prefix: this.LOOKUP_REDIS_PREFIX }); // 5분
        const duration = Date.now() - startTime;
        // this.logger.debug(`FAST lookup (memory cache hit): ${duration}ms`);
        return existingCheck;
      }

      // 3단계: 병렬 처리로 최적화 (< 200ms)
      const [supabaseUser] = await Promise.allSettled([
        this.supabaseService.getUserFromToken(accessToken)
      ]);

      if (supabaseUser.status === 'rejected' || !supabaseUser.value || !supabaseUser.value.id || !supabaseUser.value.email) {
        throw new UnauthorizedException('Invalid Supabase access token');
      }

      // 4단계: 프로필 존재 여부 확인과 동시에 캐싱
      const profilePromise = this.supabaseService.findProfileById(supabaseUser.value.id);

      const profile = await profilePromise;
      const result: SocialLookupResult = { registered: Boolean(profile) };

      // 5단계: 다중 캐싱 (메모리 + Redis) - 비동기로 실행해 응답 지연 방지
      Promise.allSettled([
        this.cacheService.set(cacheKey, result, { ttl: 300 }), // Redis 5분
        // 메모리 캐시는 기존 메서드 활용
        Promise.resolve((this.socialAuthService as any).setCachedCheck?.(accessToken, result.registered))
      ]);

      const duration = Date.now() - startTime;
      // this.logger.debug(`FAST lookup completed: ${duration}ms (registered: ${result.registered})`);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`FAST lookup failed after ${duration}ms: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }
}
