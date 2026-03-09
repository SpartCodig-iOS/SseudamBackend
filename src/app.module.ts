import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { SharedModule } from './modules/shared/shared.module';
import { DatabaseModule } from './modules/database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { OAuthModule } from './modules/oauth/oauth.module';
import { ProfileModule } from './modules/profile/profile.module';
import { SessionModule } from './modules/session/session.module';
import { HealthModule } from './modules/health/health.module';
import { RequestLoggerMiddleware } from './middleware/requestLogger';
import { TravelModule } from './modules/travel/travel.module';
import { MetaModule } from './modules/meta/meta.module';
import { TravelExpenseModule } from './modules/travel-expense/travel-expense.module';
import { TravelSettlementModule } from './modules/travel-settlement/travel-settlement.module';
import { PerformanceInterceptor } from './common/interceptors/performance.interceptor';
import { ResponseTransformInterceptor } from './common/filters/response-transform.filter';
import { ApiOptimizationInterceptor } from './common/interceptors/api-optimization.interceptor';
import { HomeModule } from './home/home.module';
import { DevModule } from './modules/dev/dev.module';
import { VersionModule } from './modules/version/version.module';
import { UniversalLinksModule } from './modules/universal-links/universal-links.module';
import { QueueModule } from './modules/queue/queue.module';
import { UserModule } from './modules/user/user.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { GatewayMiddleware } from './modules/gateway/gateway.middleware';

@Module({
  imports: [
    DatabaseModule, // TypeORM 및 Repository 설정
    SharedModule,
    AuthModule,
    OAuthModule,
    ProfileModule,
    HealthModule,
    TravelModule,
    MetaModule,
    TravelExpenseModule,
    TravelSettlementModule,
    SessionModule,
    HomeModule,
    DevModule,
    VersionModule,
    UniversalLinksModule,
    QueueModule, // 🎯 Redis Bull Queue 비동기 처리
    UserModule, // TypeORM을 사용한 새로운 사용자 관리
    GatewayModule, // 🔐 Gateway 기반 인증 및 권한 관리
  ],
  providers: [
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
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Gateway 미들웨어를 먼저 적용 (인증 및 인가)
    consumer
      .apply(GatewayMiddleware)
      .exclude(
        // Gateway 자체 엔드포인트는 제외
        { path: 'api/v1/gateway/(.*)', method: RequestMethod.ALL },
        // Health check는 Gateway 검증 제외
        { path: 'api/v1/health', method: RequestMethod.GET },
        // 정적 파일 제외
        { path: 'favicon.ico', method: RequestMethod.GET },
      )
      .forRoutes('*');

    // 요청 로깅 미들웨어는 Gateway 이후에 적용
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
