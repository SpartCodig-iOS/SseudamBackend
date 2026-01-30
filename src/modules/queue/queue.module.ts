import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QUEUES } from '../../common/constants/queue.constants';
import { NotificationProcessor } from './processors/notification.processor';
import { SettlementProcessor } from './processors/settlement.processor';
import { QueueEventService } from './services/queue-event.service';

@Module({
  imports: [
    // Redis 연결 설정 (환경변수 사용)
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        // Railway Redis의 경우 TLS 필요할 수 있음
        ...(process.env.REDIS_TLS === 'true' && {
          tls: {}
        })
      },
    }),

    // 🎯 개별 Queue들 등록
    BullModule.registerQueue(
      { name: QUEUES.NOTIFICATION },
      { name: QUEUES.SETTLEMENT },
      { name: QUEUES.EMAIL },
      { name: QUEUES.ANALYTICS }
    ),
  ],
  providers: [
    NotificationProcessor,
    SettlementProcessor,
    QueueEventService,
  ],
  exports: [QueueEventService], // 다른 모듈에서 이벤트 발송할 수 있게
})
export class QueueModule {}