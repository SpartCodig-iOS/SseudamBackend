/**
 * JwtSharedModule
 *
 * JWT 발급/검증/블랙리스트 로직을 한 곳에서 관리한다.
 * AuthModule과 OAuthModule이 서로를 forwardRef로 참조하던 순환 의존성의
 * 핵심 원인이었던 공유 JWT 서비스들을 이 독립 모듈로 분리함으로써
 * 순환 참조를 완전히 제거한다.
 *
 * 의존 관계:
 *   JwtSharedModule -> CacheSharedModule (CacheService 주입)
 *   AuthModule      -> JwtSharedModule  (import)
 *   OAuthModule     -> JwtSharedModule  (import)
 *   GatewayModule   -> JwtSharedModule  (import)
 *
 * 규칙:
 *  1. JwtModule.register()를 단 한 번 정의한다.
 *  2. CacheSharedModule(@Global)의 CacheService를 직접 주입받는다.
 *  3. AuthModule/OAuthModule을 import하지 않는다.
 */
import { Global, Module, Logger } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { env } from '../../config/env';
import { JwtTokenService } from '../auth/services/jwt.service';
import { OptimizedJwtTokenService } from '../auth/services/optimized-jwt.service';
import { EnhancedJwtService } from '../auth/services/enhanced-jwt.service';
import { JwtBlacklistService } from '../auth/services/jwt-blacklist.service';

// JWT Secret 디버깅 정보
const logger = new Logger('JwtSharedModule');
const secretLength = env.jwtSecret.length;
const secretPrefix = env.jwtSecret.substring(0, 8);
const isDevFallback = env.jwtSecret.includes('dev-only') || env.jwtSecret.includes('fallback');

logger.log(`JWT Secret configured: length=${secretLength}, prefix=${secretPrefix}***, isDevFallback=${isDevFallback}`);

@Global()
@Module({
  imports: [
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
    JwtTokenService,
    OptimizedJwtTokenService,
    EnhancedJwtService,
    JwtBlacklistService,
  ],
  exports: [
    JwtModule,
    JwtTokenService,
    OptimizedJwtTokenService,
    EnhancedJwtService,
    JwtBlacklistService,
  ],
})
export class JwtSharedModule {}
