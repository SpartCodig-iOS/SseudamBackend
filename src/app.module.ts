import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
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

@Module({
  imports: [
    SharedModule,
    AuthModule,
    OAuthModule,
    ProfileModule,
    SessionModule,
    HealthModule,
    TravelModule,
    MetaModule,
    TravelExpenseModule,
    TravelSettlementModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
