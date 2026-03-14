import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { OptimizedJwtTokenService } from './services/optimized-jwt-token.service';
import { JwtTokenService } from './services/jwtService';
import { JwtBlacklistService } from './services/jwt-blacklist.service';
import { env } from '../../config/env';

/**
 * JwtSharedModule
 *
 * JWT 관련 서비스들을 전역적으로 제공하는 모듈
 * - JwtModule: NestJS 기본 JWT 모듈
 * - JwtTokenService: 기본 JWT 토큰 서비스
 * - OptimizedJwtTokenService: 최적화된 JWT 토큰 서비스
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
    JwtTokenService,
    OptimizedJwtTokenService,
    JwtBlacklistService,
  ],
  exports: [
    JwtModule,
    JwtTokenService,
    OptimizedJwtTokenService,
    JwtBlacklistService,
  ],
})
export class JwtSharedModule {}