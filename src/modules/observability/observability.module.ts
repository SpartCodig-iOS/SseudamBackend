/**
 * ObservabilityModule
 *
 * 관찰 가능성 관련 인프라를 하나의 모듈로 묶는다.
 * @Global() 선언으로 AppModule에 한 번만 import하면 전체 앱에서 사용 가능.
 *
 * 제공하는 서비스:
 *   AppMetricsService  - Prometheus 메트릭 레지스트리
 *
 * 노출하는 컨트롤러:
 *   MetricsController  - GET /metrics (Prometheus 형식)
 */
import { Global, Module } from '@nestjs/common';
import { AppMetricsService } from '../../common/metrics/app-metrics.service';
import { MetricsController } from './metrics.controller';
import { CacheMetricsScheduler } from './cache-metrics.scheduler';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    AppMetricsService,
    CacheMetricsScheduler,
  ],
  exports: [AppMetricsService],
})
export class ObservabilityModule {}
