import { Injectable, Logger } from '@nestjs/common';
import { SocialAuthService, OAuthTokenOptions } from './social-auth.service';
import { LoginType } from '../../types/auth';
import { AuthSessionPayload } from '../auth/auth.service';
import { CacheService } from '../../services/cacheService';
import { createHash } from 'crypto';

@Injectable()
export class OptimizedOAuthService {
  private readonly logger = new Logger(OptimizedOAuthService.name);
  private readonly FAST_OAUTH_CACHE_PREFIX = 'fast_oauth';
  private readonly FAST_OAUTH_CACHE_TTL = 2 * 60; // 2분

  constructor(
    private readonly socialAuthService: SocialAuthService,
    private readonly cacheService: CacheService,
  ) {}

  private getFastCacheKey(accessToken: string, loginType: LoginType): string {
    const hash = createHash('sha256').update(`${accessToken}:${loginType}`).digest('hex');
    return `${this.FAST_OAUTH_CACHE_PREFIX}:${hash.substring(0, 16)}`;
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
      const cachedResult = await this.cacheService.get<AuthSessionPayload>(cacheKey);
      if (cachedResult) {
        const duration = Date.now() - startTime;
        this.logger.debug(`Ultra-fast OAuth (cached): ${duration}ms`);
        return cachedResult;
      }

      // 2. 백그라운드 캐시 설정과 함께 OAuth 처리
      const resultPromise = this.socialAuthService.loginWithOAuthToken(accessToken, loginType, options);

      // 3. 결과를 캐시에 저장 (다음 동일한 요청을 위해)
      resultPromise.then((result) => {
        this.cacheService.set(cacheKey, result, { ttl: this.FAST_OAUTH_CACHE_TTL })
          .catch(err => this.logger.warn(`Failed to cache OAuth result: ${err.message}`));
      });

      const result = await resultPromise;
      const duration = Date.now() - startTime;
      this.logger.debug(`Fast OAuth login completed: ${duration}ms`);

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
    this.logger.debug(`Optimized OAuth with token exchange: ${duration}ms`);

    return authResult;
  }
}