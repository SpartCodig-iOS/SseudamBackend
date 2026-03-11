/**
 * HealthModule
 *
 * 헬스체크 엔드포인트를 제공한다.
 * CacheService(@Global CacheSharedModule)와 SupabaseService(AuthSharedModule)를
 * 자동 주입받으므로 직접 provide할 필요가 없다.
 */
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { AuthSharedModule } from '../shared/auth-shared.module';
import { PoolMonitorService } from './pool-monitor.service';

@Module({
  imports: [
    AuthSharedModule,
    // CacheSharedModule(@Global) -> CacheService, AdaptiveCacheService 자동 주입
  ],
  controllers: [HealthController],
  providers: [PoolMonitorService],
  exports: [PoolMonitorService],
})
export class HealthModule {}
