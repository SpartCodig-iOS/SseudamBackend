/**
 * CacheMetricsScheduler
 *
 * 10초마다 CacheService 통계를 읽어 Prometheus 게이지를 갱신한다.
 * CacheService 코드를 수정하지 않고 메트릭을 수집하는 비침투적 방식.
 *
 * 캐시 히트율은 Redis 가용 여부와 fallback 크기로 근사한다:
 *   - Redis 연결 중: redis 히트율 = 1.0 (정상 동작 가정)
 *   - Redis 다운 (fallback only): 히트율 = fallback size > 0 ? 0.5 : 0.0
 */
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { CacheService } from '../../services/cacheService';
import { AppMetricsService } from '../../common/metrics/app-metrics.service';

@Injectable()
export class CacheMetricsScheduler implements OnModuleInit, OnModuleDestroy {
  private intervalHandle: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL_MS = 10_000;

  constructor(
    private readonly cacheService: CacheService,
    private readonly metricsService: AppMetricsService,
  ) {}

  onModuleInit(): void {
    // 첫 실행은 즉시, 이후는 10초마다
    void this.collect();
    this.intervalHandle = setInterval(() => void this.collect(), this.POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  private async collect(): Promise<void> {
    try {
      const stats = await Promise.race([
        this.cacheService.getStats(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 500)),
      ]);

      if (!stats) return;

      const redisStatus = stats.redis?.status;
      const redisConnected =
        redisStatus === 'connected' || redisStatus === 'ready' || redisStatus === 'ok';
      const fallbackSize: number = stats.fallback?.size ?? 0;

      // Redis 연결 여부로 히트율 근사
      const redisHitRatio = redisConnected ? 1.0 : 0.0;
      const memoryHitRatio = fallbackSize > 0 ? Math.min(fallbackSize / 100, 1.0) : 0.0;

      this.metricsService.updateCacheHitRatio('redis', redisHitRatio);
      this.metricsService.updateCacheHitRatio('memory', memoryHitRatio);
    } catch {
      // 수집 실패는 무시 (관찰 가능성 레이어가 앱 동작에 영향 주면 안 됨)
    }
  }
}
