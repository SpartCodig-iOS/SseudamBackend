import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { GatewayMiddleware } from './gateway.middleware';
import { TypeOrmGatewayService } from './services/typeorm-gateway.service';
import { GatewayAuthGuard } from './guards/gateway-auth.guard';

// Auth 관련
import { JwtBlacklist } from '../auth/entities/jwt-blacklist.entity';
import { JwtBlacklistRepository } from '../auth/repositories/jwt-blacklist.repository';
import { TypeOrmJwtBlacklistService } from '../auth/services/typeorm-jwt-blacklist.service';

// Common 서비스
import { RateLimitService } from '../cache-shared/services/rateLimitService';
import { CacheService } from '../cache-shared/services/cacheService';
import { env } from '../../config/env';

@Module({
  imports: [
    // TypeORM Entities
    TypeOrmModule.forFeature([JwtBlacklist]),

    // JWT 모듈
    JwtModule.register({
      secret: env.jwtSecret,
      signOptions: {
        expiresIn: `${env.accessTokenTTL}s`,
        issuer: 'sseudam-backend',
        audience: 'sseudam-app',
      },
    }),
  ],
  controllers: [GatewayController],
  providers: [
    // 기존 서비스 (하위 호환성)
    GatewayService,
    GatewayMiddleware,

    // TypeORM 기반 새로운 서비스들
    TypeOrmGatewayService,
    GatewayAuthGuard,

    // Repository 계층
    JwtBlacklistRepository,

    // 비즈니스 서비스 계층
    TypeOrmJwtBlacklistService,

    // 공통 서비스
    RateLimitService,
    CacheService,
  ],
  exports: [
    GatewayService,
    GatewayMiddleware,
    TypeOrmGatewayService,
    GatewayAuthGuard,
    TypeOrmJwtBlacklistService,
  ],
})
export class GatewayModule {}