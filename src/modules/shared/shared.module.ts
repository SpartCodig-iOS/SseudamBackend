import { Global, Module, forwardRef } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtModule } from '@nestjs/jwt';
import { env } from '../../config/env';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { JwtTokenService } from '../jwt-shared/services/jwtService';
import { OptimizedJwtTokenService } from '../jwt-shared/services/optimized-jwt.service';
import { EnhancedJwtService } from '../jwt-shared/services/enhanced-jwt.service';
import { TypeOrmJwtBlacklistService } from '../auth/services/typeorm-jwt-blacklist.service';
import { SupabaseService } from '../core/services/supabaseService';
import { OAuthTokenService } from '../oauth/services/oauth-token.service';
// import { SessionService } from '../auth/services/sessionService'; // 삭제됨
import { RateLimitService } from '../cache-shared/services/rateLimitService';
import { SmartCacheService } from '../cache-shared/services/smart-cache.service';
import { CacheService } from '../cache-shared/services/cacheService';
import { BackgroundJobService } from '../core/services/background-job.service';
import { OptimizedOAuthService } from '../oauth/services/optimized-oauth.service';
import { OptimizedDeleteService } from '../auth/services/optimized-delete.service';
import { SocialAuthService } from '../oauth/services/social-auth.service';
import { AuthService } from '../auth/services/auth.service';
import { RolesGuard } from '../../common/guards/roles.guard';
// import { DeviceTokenService } from '../notification/services/device-token.service'; // 삭제됨
import { APNSService } from '../notification/services/apns.service';
import { PushNotificationService } from '../notification/services/push-notification.service';
import { AnalyticsService } from '../core/services/analytics.service';
import { DatabaseModule } from '../database/database.module';

@Global()
@Module({
  imports: [
    DatabaseModule,
    EventEmitterModule.forRoot(),
    JwtModule.register({
      secret: env.jwtSecret,
      signOptions: {
        expiresIn: `${env.accessTokenTTL}s`,
        issuer: 'sseudam-backend',
        audience: 'sseudam-app',
      },
    }),
  ],
  providers: [
    CacheService,
    SupabaseService,
    OAuthTokenService,
    JwtTokenService,
    OptimizedJwtTokenService,
    EnhancedJwtService,
    TypeOrmJwtBlacklistService,
    SmartCacheService,
    AuthService,
    SocialAuthService,
    OptimizedOAuthService,
    OptimizedDeleteService,
    // SessionService, // 삭제됨
    RateLimitService,
    BackgroundJobService,
    // DeviceTokenService, // 삭제됨
    APNSService,
    PushNotificationService,
    AnalyticsService,
    AuthGuard,
    RolesGuard,
    RateLimitGuard,
  ],
  exports: [
    EventEmitterModule,
    CacheService,
    SupabaseService,
    OAuthTokenService,
    JwtTokenService,
    OptimizedJwtTokenService,
    EnhancedJwtService,
    TypeOrmJwtBlacklistService,
    SmartCacheService,
    AuthService,
    SocialAuthService,
    OptimizedOAuthService,
    OptimizedDeleteService,
    // SessionService, // 삭제됨
    RateLimitService,
    BackgroundJobService,
    // DeviceTokenService, // 삭제됨
    APNSService,
    PushNotificationService,
    AnalyticsService,
    AuthGuard,
    RolesGuard,
    RateLimitGuard,
  ],
})
export class SharedModule {}
