import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { GatewayMiddleware } from './gateway.middleware';
import { EnhancedJwtService } from '../../services/enhanced-jwt.service';
import { JwtBlacklistService } from '../../services/jwt-blacklist.service';
import { RateLimitService } from '../../services/rateLimitService';
import { CacheService } from '../../services/cacheService';
import { env } from '../../config/env';

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
  controllers: [GatewayController],
  providers: [
    GatewayService,
    GatewayMiddleware,
    EnhancedJwtService,
    JwtBlacklistService,
    RateLimitService,
    CacheService,
  ],
  exports: [GatewayService, GatewayMiddleware],
})
export class GatewayModule {}