/**
 * GatewayModule
 *
 * API Gateway: 모든 요청의 인증/인가 및 Rate Limit을 처리한다.
 *
 * 이전 문제: JwtModule.register()를 직접 등록하고 EnhancedJwtService,
 *           JwtBlacklistService, CacheService, RateLimitService를 모두 직접 provide.
 *
 * 개선: JwtSharedModule(@Global)과 CacheSharedModule(@Global)이 자동으로
 *      필요한 서비스를 주입하므로 GatewayModule은 비즈니스 서비스에만 집중한다.
 */
import { Module } from '@nestjs/common';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { GatewayMiddleware } from './gateway.middleware';

@Module({
  // JwtSharedModule  -> EnhancedJwtService, JwtBlacklistService, JwtModule (@Global)
  // CacheSharedModule -> CacheService, RateLimitService (@Global)
  controllers: [GatewayController],
  providers: [
    GatewayService,
    GatewayMiddleware,
  ],
  exports: [GatewayService, GatewayMiddleware],
})
export class GatewayModule {}
