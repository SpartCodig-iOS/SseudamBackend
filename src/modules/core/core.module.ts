import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AnalyticsService } from './services/analytics.service';
import { BackgroundJobService } from './services/background-job.service';

/**
 * CoreModule
 *
 * 애플리케이션의 핵심 인프라 서비스들을 제공하는 전역 모듈
 * - EventEmitter: 애플리케이션 전체 이벤트 시스템
 * - AnalyticsService: 이벤트 추적 및 분석
 * - BackgroundJobService: 백그라운드 작업 관리
 */
@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot({
      // 이벤트 리스너에서 에러 발생 시 애플리케이션이 중단되지 않도록 설정
      ignoreErrors: false,
      // 와일드카드 이벤트 지원
      wildcard: false,
      // 최대 리스너 수 (메모리 누수 방지)
      maxListeners: 20,
      // 새 리스너 경고 임계값
      newListener: false,
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