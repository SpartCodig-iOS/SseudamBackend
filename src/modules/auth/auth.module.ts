/**
 * AuthModule
 *
 * 이메일/비밀번호 기반 인증, 토큰 갱신, 로그아웃, 회원탈퇴를 담당한다.
 *
 * 의존 관계 (forwardRef 완전 제거):
 *   AuthModule -> JwtSharedModule  (전역, JwtTokenService/EnhancedJwtService)
 *   AuthModule -> CacheSharedModule (전역, CacheService)
 *   AuthModule -> AuthSharedModule  (SupabaseService, SessionService 등)
 *   AuthModule -> OAuthModule       (SocialAuthService, OptimizedOAuthService)
 *
 * OAuthModule은 AuthModule을 import하지 않는다.
 * 과거의 순환(Auth <-> OAuth)은 AuthSharedModule 분리로 해소되었다.
 */
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OptimizedDeleteService } from './optimized-delete.service';
import { OAuthModule } from '../oauth/oauth.module';
import { DatabaseModule } from '../database/database.module';
import { AuthSharedModule } from '../shared/auth-shared.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    DatabaseModule,
    AuthSharedModule,
    NotificationModule,  // DeviceTokenService 주입
    // OAuthModule은 SocialAuthService, OptimizedOAuthService를 export한다.
    // OAuthModule은 AuthModule을 import하지 않으므로 순환 참조 없음.
    OAuthModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OptimizedDeleteService,
  ],
  exports: [
    AuthService,
    OptimizedDeleteService,
  ],
})
export class AuthModule {}
