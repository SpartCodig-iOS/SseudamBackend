import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { SharedModule } from './modules/shared/shared.module';
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

@Module({
  imports: [
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
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
