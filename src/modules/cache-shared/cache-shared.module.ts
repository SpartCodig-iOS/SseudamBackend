/**
 * CacheSharedModule
 *
 * Redis/인메모리 캐싱 전략을 한 곳에서 관리한다.
 * - CacheService: Redis fallback 포함 기본 캐시 (get/set/del/scan)
 * - SmartCacheService: 캐시 aside 패턴, 선제적 갱신 등 고수준 캐시
 * - RateLimitService: IP/User 기반 슬라이딩 윈도우 Rate Limit
 *
 * 규칙:
 *  1. 캐시 인프라 외의 비즈니스 로직을 포함하지 않는다.
 *  2. DatabaseModule에 의존하지 않는다.
 *  3. @Global()로 선언해 각 Feature Module이 직접 import하지 않아도 된다.
 */
import { Global, Module } from '@nestjs/common';
import { CacheService } from '../../common/services/cache.service';
import { SmartCacheService } from '../../common/services/smart-cache.service';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { AdaptiveCacheService } from '../../common/services/adaptive-cache.service';

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
