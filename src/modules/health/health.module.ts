/**
 * HealthModule
 *
 * 헬스체크 및 메트릭스 엔드포인트를 제공한다.
 * 캐시 상태, 데이터베이스 상태, 시스템 메트릭을 포함한다.
 */
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { SimpleHealthController } from './simple-health.controller';
import { PoolMonitorService } from './pool-monitor.service';

@Module({
  controllers: [SimpleHealthController, HealthController],
  providers: [PoolMonitorService],
  exports: [PoolMonitorService],
})
export class HealthModule {}
