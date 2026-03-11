/**
 * OAuthModule
 *
 * 소셜 로그인(Apple, Google, Kakao) 및 OAuth 토큰 교환을 담당한다.
 *
 * 핵심 설계 원칙 - 순환 참조 제거:
 *   과거: OAuthModule <-> AuthModule (forwardRef 필요)
 *   현재: OAuthModule -> AuthSharedModule (단방향)
 *
 * SocialAuthService가 AuthService에 의존하던 로직을 AuthSharedModule의
 * 공유 서비스(SupabaseService, SessionService, JwtTokenService)를 직접
 * 사용하도록 분리한다.
 *
 * AuthService의 고수준 오케스트레이션이 필요한 경우 AuthModule이
 * OAuthModule을 import해 단방향으로 해결한다.
 */
import { Module } from '@nestjs/common';
import { OAuthController } from './oauth.controller';
import { SocialAuthService } from './social-auth.service';
import { OptimizedOAuthService } from './optimized-oauth.service';
import { DatabaseModule } from '../database/database.module';
import { AuthSharedModule } from '../shared/auth-shared.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    DatabaseModule,
    AuthSharedModule,
    NotificationModule,  // DeviceTokenService 주입
    // JwtSharedModule, CacheSharedModule은 @Global()이므로 자동 주입됨
  ],
  controllers: [OAuthController],
  providers: [
    SocialAuthService,
    OptimizedOAuthService,
  ],
  exports: [
    SocialAuthService,
    OptimizedOAuthService,
  ],
})
export class OAuthModule {}
