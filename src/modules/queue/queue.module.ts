import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { env } from '../../config/env';
import { QUEUES } from '../../common/constants/queue.constants';
import { NotificationProcessor } from './processors/notification.processor';
import { SettlementProcessor } from './processors/settlement.processor';
import { QueueEventService } from './services/queue-event.service';

/**
 * Redis 연결 설정.
 * env 객체를 통해 기본값이 보장되므로 개발환경에서는
 * REDIS_HOST/REDIS_PORT 설정 없이도 localhost:6379로 연결을 시도한다.
 * Redis 연결에 실패해도 애플리케이션 자체는 기동되도록
 * createClient 옵션에서 enableOfflineQueue를 비활성화한다.
 */
const buildRedisConfig = () => {
  // REDIS_URL(단일 연결 문자열)이 있으면 우선 사용
  if (env.redisUrl) {
    try {
      const parsed = new URL(env.redisUrl);
      return {
        host: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : 6379,
        password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
        ...(env.redisTls ? { tls: {} } : {}),
      };
    } catch {
      // URL 파싱 실패 시 개별 설정으로 폴백
    }
  }

  return {
    host: env.redisHost,
    port: env.redisPort,
    password: env.redisPassword,
    ...(env.redisTls ? { tls: {} } : {}),
  };
};

@Module({
  imports: [
    BullModule.forRoot({
      redis: buildRedisConfig(),
    }),

    BullModule.registerQueue(
      { name: QUEUES.NOTIFICATION },
      { name: QUEUES.SETTLEMENT },
      { name: QUEUES.EMAIL },
      { name: QUEUES.ANALYTICS },
    ),
  ],
  providers: [
    NotificationProcessor,
    SettlementProcessor,
    QueueEventService,
  ],
  exports: [QueueEventService],
})
export class QueueModule {}
