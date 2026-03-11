/**
 * CoreModule
 *
 * 진정으로 애플리케이션 전역에서 필요한 인프라성 기능만 담당한다.
 * - EventEmitterModule: 도메인 이벤트 버스
 * - AnalyticsService: GA 이벤트 트래킹
 * - BackgroundJobService: 경량 인메모리 잡 큐
 *
 * 규칙:
 *  1. 비즈니스 로직이 없는 인프라 서비스만 포함한다.
 *  2. 다른 Feature Module에 의존하면 안 된다.
 *  3. @Global()로 선언해 AppModule에서 한 번만 import한다.
 */
import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AnalyticsService } from '../../common/services/analytics.service';
import { BackgroundJobService } from '../../common/services/background-job.service';

@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot({
      // 와일드카드 이벤트 리스너 허용 ('expense.*' 등)
      wildcard: false,
      // 동일 리스너 최대 등록 수
      maxListeners: 20,
    }),
  ],
  providers: [
    AnalyticsService,
    BackgroundJobService,
  ],
  exports: [
    EventEmitterModule,
    AnalyticsService,
    BackgroundJobService,
  ],
})
export class CoreModule {}
