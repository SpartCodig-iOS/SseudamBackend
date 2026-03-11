/**
 * TravelExpenseModule
 *
 * 여행 지출 등록/수정/삭제/조회를 담당한다.
 * 지출 발생 시 EventEmitter로 푸시 알림 이벤트를 발행한다.
 *
 * 이전 문제: CacheService를 직접 provide해 중복 인스턴스 생성.
 * 개선:
 *   - CacheSharedModule(@Global) -> CacheService 자동 주입
 *   - CoreModule(@Global) -> EventEmitter2 자동 주입 (알림 이벤트 발행용)
 */
import { Module } from '@nestjs/common';
import { TravelExpenseController } from './travel-expense.controller';
import { TravelExpenseService } from './travel-expense.service';
import { MetaModule } from '../meta/meta.module';
import { ProfileModule } from '../profile/profile.module';
import { QueueModule } from '../queue/queue.module';
import { DatabaseModule } from '../database/database.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    DatabaseModule,
    MetaModule,
    ProfileModule,
    QueueModule,
    NotificationModule,  // PushNotificationService 주입
    // CacheSharedModule(@Global) -> CacheService 자동 주입
    // CoreModule(@Global)        -> EventEmitter2 자동 주입
  ],
  controllers: [TravelExpenseController],
  providers: [TravelExpenseService],
  exports: [TravelExpenseService],
})
export class TravelExpenseModule {}
