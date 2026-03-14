import { Global, Module } from '@nestjs/common';
import { CacheService } from './services/cacheService';
import { SmartCacheService } from './services/smart-cache.service';
import { RateLimitService } from './services/rateLimitService';
import { AdaptiveCacheService } from './services/adaptive-cache.service';

/**
 * CacheSharedModule
 *
 * 캐싱 관련 서비스들을 전역적으로 제공하는 모듈
 * - CacheService: 기본 Redis 캐시 서비스
 * - SmartCacheService: 스마트 캐시 전략
 * - RateLimitService: 요청 제한 서비스
 * - AdaptiveCacheService: 적응형 캐시 서비스
 */
@Global()
@Module({
  providers: [
    CacheService,
    SmartCacheService,
    RateLimitService,
    AdaptiveCacheService,
  ],
  exports: [
    CacheService,
    SmartCacheService,
    RateLimitService,
    AdaptiveCacheService,
  ],
})
export class CacheSharedModule {}