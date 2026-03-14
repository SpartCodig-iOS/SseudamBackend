import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
// import { ObservabilityModule } from './modules/observability/observability.module'; // 임시 비활성화

// 인프라 모듈 (전역, 순서 중요)
import { CoreModule } from './modules/core/core.module';
import { CacheSharedModule } from './modules/cache-shared/cache-shared.module';
import { JwtSharedModule } from './modules/jwt-shared/jwt-shared.module';
// import { AuthSharedModule } from './modules/shared/auth-shared.module'; // 임시 비활성화
import { DatabaseModule } from './modules/database/database.module';

// 기능 모듈
// import { AuthModule } from './modules/auth/auth.module'; // 임시 비활성화
// import { OAuthModule } from './modules/oauth/oauth.module'; // 임시 비활성화
// import { ProfileModule } from './modules/profile/profile.module'; // 임시 비활성화
// import { SessionModule } from './modules/session/session.module'; // 임시 비활성화
import { HealthModule } from './modules/health/health.module';
import { TravelModule } from './modules/travel/travel.module';
// import { MetaModule } from './modules/meta/meta.module'; // 임시 비활성화
import { TravelExpenseModule } from './modules/travel-expense/travel-expense.module';
import { TravelSettlementModule } from './modules/travel-settlement/travel-settlement.module';
// import { NotificationModule } from './modules/notification/notification.module'; // 임시 비활성화
// import { DevModule } from './modules/dev/dev.module'; // 임시 비활성화
// import { VersionModule } from './modules/version/version.module'; // 임시 비활성화
// import { UniversalLinksModule } from './modules/universal-links/universal-links.module'; // 임시 비활성화
// import { QueueModule } from './modules/queue/queue.module'; // 임시 비활성화
import { UserModule } from './modules/user/user.module';
// 핵심 모듈들 활성화
import { AuthModule } from './modules/auth/auth.module';
import { OAuthModule } from './modules/oauth/oauth.module';
import { ProfileModule } from './modules/profile/profile.module';
import { NotificationModule } from './modules/notification/notification.module';
// import { GatewayModule } from './modules/gateway/gateway.module'; // 임시 비활성화

// 공통 인터셉터 - 임시 비활성화
// import { PerformanceInterceptor } from './common/interceptors/performance.interceptor';
// import { ResponseTransformInterceptor } from './common/filters/response-transform.filter';
// import { ApiOptimizationInterceptor } from './common/interceptors/api-optimization.interceptor';
// import { ResponseOptimizerInterceptor } from './common/interceptors/response-optimizer.interceptor';

// 미들웨어 - 임시 비활성화
// import { RequestLoggerMiddleware } from './middleware/requestLogger';
// import { GatewayMiddleware } from './modules/gateway/gateway.middleware';

/**
 * AppModule
 *
 * 모듈 로딩 순서:
 *   1. 인프라 모듈 (@Global): CoreModule -> CacheSharedModule -> JwtSharedModule -> AuthSharedModule
 *   2. 데이터베이스: DatabaseModule
 *   3. 기능 모듈: 각 Feature Module (인프라 모듈의 전역 서비스를 자동 주입받음)
 *
 * forwardRef 제거 결과:
 *   AuthModule -> OAuthModule (단방향)
 *   OAuthModule -> AuthSharedModule (AuthModule 참조 없음)
 */
@Module({
  imports: [
    // ── 전역 인프라 모듈 (순서 중요: 전역으로 등록되어 이후 모든 모듈에서 사용 가능) ──
    CoreModule,           // EventEmitter, AnalyticsService, BackgroundJobService
    CacheSharedModule,    // CacheService, SmartCacheService, RateLimitService
    JwtSharedModule,      // JwtModule, JwtTokenService, EnhancedJwtService, JwtBlacklistService
    DatabaseModule,       // TypeORM, Repository들
    // ObservabilityModule,  // Prometheus 메트릭, /metrics 엔드포인트 - 임시 비활성화

    // ── 기능 모듈 (핵심만) ──
    HealthModule,         // 헬스체크
    UserModule,           // 사용자 관리 (TypeORM)
    AuthModule,           // 인증 모듈
    OAuthModule,          // 소셜 로그인
    ProfileModule,        // 프로필 관리
    NotificationModule,   // 알림 관리

    // ── Travel 관련 모듈 ──
    TravelModule,         // 여행 관리
    TravelExpenseModule,  // 여행 경비 관리
    TravelSettlementModule, // 여행 정산 관리
  ],
  providers: [
    // 임시로 인터셉터들 비활성화
    // {
    //   provide: APP_INTERCEPTOR,
    //   useClass: SentryInterceptor,
    // },
    // {
    //   provide: APP_INTERCEPTOR,
    //   useClass: MetricsInterceptor,
    // },
    // {
    //   provide: APP_INTERCEPTOR,
    //   useClass: PerformanceInterceptor,
    // },
    // {
    //   provide: APP_INTERCEPTOR,
    //   useClass: ResponseTransformInterceptor,
    // },
    // {
    //   provide: APP_INTERCEPTOR,
    //   useClass: ApiOptimizationInterceptor,
    // },
    // {
    //   provide: APP_INTERCEPTOR,
    //   useClass: ResponseOptimizerInterceptor,
    // },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // 임시로 미들웨어 비활성화
    // consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
