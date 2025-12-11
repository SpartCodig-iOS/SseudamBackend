import { Global, Module, forwardRef } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { JwtTokenService } from '../../services/jwtService';
import { OptimizedJwtTokenService } from '../../services/optimized-jwt.service';
import { SupabaseService } from '../../services/supabaseService';
import { OAuthTokenService } from '../../services/oauth-token.service';
import { SessionService } from '../../services/sessionService';
import { RateLimitService } from '../../services/rateLimitService';
import { SmartCacheService } from '../../services/smart-cache.service';
import { CacheService } from '../../services/cacheService';
import { BackgroundJobService } from '../../services/background-job.service';
import { OptimizedOAuthService } from '../oauth/optimized-oauth.service';
import { OptimizedDeleteService } from '../auth/optimized-delete.service';
import { SocialAuthService } from '../oauth/social-auth.service';
import { AuthService } from '../auth/auth.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DeviceTokenService } from '../../services/device-token.service';
import { APNSService } from '../../services/apns.service';
import { PushNotificationService } from '../../services/push-notification.service';
import { AnalyticsService } from '../../services/analytics.service';

@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot(),
  ],
  providers: [
    CacheService,
    SupabaseService,
    OAuthTokenService,
    JwtTokenService,
    OptimizedJwtTokenService,
    SmartCacheService,
    AuthService,
    SocialAuthService,
    OptimizedOAuthService,
    OptimizedDeleteService,
    SessionService,
    RateLimitService,
    BackgroundJobService,
    DeviceTokenService,
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
    SmartCacheService,
    AuthService,
    SocialAuthService,
    OptimizedOAuthService,
    OptimizedDeleteService,
    SessionService,
    RateLimitService,
    BackgroundJobService,
    DeviceTokenService,
    APNSService,
    PushNotificationService,
    AnalyticsService,
    AuthGuard,
    RolesGuard,
    RateLimitGuard,
  ],
})
export class SharedModule {}
