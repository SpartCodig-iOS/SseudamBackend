import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ObservabilityModule } from './modules/observability/observability.module';
import { MetricsInterceptor } from './common/interceptors/metrics.interceptor';
import { SentryInterceptor } from './common/interceptors/sentry.interceptor';

// 인프라 모듈 (전역, 순서 중요)
import { CoreModule } from './modules/core/core.module';
import { CacheSharedModule } from './modules/cache-shared/cache-shared.module';
import { JwtSharedModule } from './modules/jwt-shared/jwt-shared.module';
import { AuthSharedModule } from './modules/shared/auth-shared.module';
import { DatabaseModule } from './modules/database/database.module';

// 기능 모듈
import { AuthModule } from './modules/auth/auth.module';
import { OAuthModule } from './modules/oauth/oauth.module';
import { ProfileModule } from './modules/profile/profile.module';
import { SessionModule } from './modules/session/session.module';
import { HealthModule } from './modules/health/health.module';
import { TravelModule } from './modules/travel/travel.module';
import { MetaModule } from './modules/meta/meta.module';
import { TravelExpenseModule } from './modules/travel-expense/travel-expense.module';
import { TravelSettlementModule } from './modules/travel-settlement/travel-settlement.module';
import { NotificationModule } from './modules/notification/notification.module';
import { DevModule } from './modules/dev/dev.module';
import { VersionModule } from './modules/version/version.module';
import { UniversalLinksModule } from './modules/universal-links/universal-links.module';
import { QueueModule } from './modules/queue/queue.module';
import { UserModule } from './modules/user/user.module';
import { GatewayModule } from './modules/gateway/gateway.module';

// 공통 인터셉터
import { PerformanceInterceptor } from './common/interceptors/performance.interceptor';
import { ResponseTransformInterceptor } from './common/filters/response-transform.filter';
import { ApiOptimizationInterceptor } from './common/interceptors/api-optimization.interceptor';
import { ResponseOptimizerInterceptor } from './common/interceptors/response-optimizer.interceptor';

// 미들웨어
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { GatewayMiddleware } from './modules/gateway/gateway.middleware';

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
    ObservabilityModule,  // Prometheus 메트릭, /metrics 엔드포인트
    AuthSharedModule,     // SupabaseService, SessionService 등 (AuthGuard 의존성 전역 제공)

    // ── 기능 모듈 ──
    AuthModule,           // 인증 (OAuthModule을 내부 import)
    OAuthModule,          // 소셜 로그인
    ProfileModule,        // 프로필 관리
    HealthModule,         // 헬스체크
    TravelModule,         // 여행 관리
    MetaModule,           // 메타 정보 (통화, 카테고리)
    TravelExpenseModule,  // 지출 관리
    TravelSettlementModule, // 정산
    NotificationModule,   // 푸시 알림 (PushNotificationService @OnEvent 리스너)
    SessionModule,        // 세션 관리
    DevModule,            // 개발 도구 (dev only)
    VersionModule,        // 앱 버전 관리
    UniversalLinksModule, // Universal Links
    QueueModule,          // Redis Bull Queue
    UserModule,           // 사용자 관리 (TypeORM)
    GatewayModule,        // API Gateway (인증/인가 미들웨어)
  ],
  providers: [
    // Sentry 인터셉터는 가장 먼저 실행되어야 에러를 올바르게 캡처함
    {
      provide: APP_INTERCEPTOR,
      useClass: SentryInterceptor,
    },
    // Prometheus HTTP 메트릭 수집
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: PerformanceInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseTransformInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiOptimizationInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseOptimizerInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Gateway 미들웨어를 먼저 적용 (인증 및 인가)
    consumer
      .apply(GatewayMiddleware)
      .exclude(
        { path: 'api/v1/gateway/(.*)', method: RequestMethod.ALL },
        { path: 'api/v1/health', method: RequestMethod.GET },
        { path: 'health', method: RequestMethod.GET },
        { path: 'health/metrics', method: RequestMethod.GET },
        { path: 'metrics', method: RequestMethod.GET },
        { path: 'api-docs/(.*)', method: RequestMethod.ALL },
        { path: 'api-docs', method: RequestMethod.ALL },
        { path: 'favicon.ico', method: RequestMethod.GET },
      )
      .forRoutes('*');

    // 요청 로깅 미들웨어는 Gateway 이후에 적용
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
