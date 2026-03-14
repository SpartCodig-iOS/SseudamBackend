import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { OptimizedJwtTokenService } from './services/optimized-jwt-token.service';
import { EnhancedJwtService } from './services/enhanced-jwt.service';
import { JwtBlacklistService } from './services/jwt-blacklist.service';
import { env } from '../../config/env';

/**
 * JwtSharedModule
 *
 * JWT 관련 서비스들을 전역적으로 제공하는 모듈
 * - JwtModule: NestJS 기본 JWT 모듈
 * - OptimizedJwtTokenService: 최적화된 JWT 토큰 서비스
 * - EnhancedJwtService: 강화된 JWT 서비스
 * - JwtBlacklistService: JWT 블랙리스트 서비스
 */
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
      verifyOptions: {
        issuer: 'sseudam-backend',
        audience: 'sseudam-app',
      },
    }),
  ],
  providers: [
    OptimizedJwtTokenService,
    EnhancedJwtService,
    JwtBlacklistService,
  ],
  exports: [
    JwtModule,
    OptimizedJwtTokenService,
    EnhancedJwtService,
    JwtBlacklistService,
  ],
})
export class JwtSharedModule {}