/**
 * SharedModule (레거시 호환 래퍼 - 최소화됨)
 *
 * 이전에는 23개의 프로바이더를 @Global()로 노출했으나
 * 이제 각 책임별 전용 모듈로 분리되었다:
 *
 *   CoreModule        -> EventEmitter, AnalyticsService, BackgroundJobService
 *   CacheSharedModule -> CacheService, SmartCacheService, RateLimitService
 *   JwtSharedModule   -> JwtModule, JwtTokenService, EnhancedJwtService, JwtBlacklistService
 *   AuthSharedModule  -> SupabaseService, OAuthTokenService, SessionService, TransactionService
 *   NotificationModule -> APNSService, DeviceTokenService, PushNotificationService
 *
 * 이 SharedModule은 AppModule이 단일 진입점으로 위 모듈들을 한 번에
 * 가져올 수 있도록 re-export하는 조정자(Aggregator) 역할만 수행한다.
 *
 * 점진적 마이그레이션:
 *   각 Feature Module이 필요한 전용 모듈을 직접 import하도록 전환되면
 *   이 모듈은 제거 가능하다.
 *
 * Guards:
 *   AuthGuard, RolesGuard, RateLimitGuard는 APP_GUARD로 전역 등록하거나
 *   각 Feature Module에서 직접 import해 사용한다.
 *   현재는 하위 호환성을 위해 여기서도 export한다.
 */
import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { CacheSharedModule } from '../cache-shared/cache-shared.module';
import { JwtSharedModule } from '../jwt-shared/jwt-shared.module';
import { AuthSharedModule } from './auth-shared.module';
import { DatabaseModule } from '../database/database.module';
import { NotificationModule } from '../notification/notification.module';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';

@Module({
  imports: [
    CoreModule,
    CacheSharedModule,
    JwtSharedModule,
    AuthSharedModule,
    // DatabaseModule: AuthGuard/RolesGuard에서 UserRepository 주입에 필요
    DatabaseModule,
    NotificationModule,
  ],
  providers: [
    // Guards: 전역 @Global() 서비스(JwtSharedModule, CacheSharedModule 등)와
    // DatabaseModule의 UserRepository를 주입받아 동작한다.
    AuthGuard,
    RolesGuard,
    RateLimitGuard,
  ],
  exports: [
    // 하위 호환: 기존에 SharedModule을 import하던 모듈들이 계속 동작하도록
    CoreModule,
    CacheSharedModule,
    JwtSharedModule,
    AuthSharedModule,
    DatabaseModule,
    NotificationModule,
    AuthGuard,
    RolesGuard,
    RateLimitGuard,
  ],
})
export class SharedModule {}
