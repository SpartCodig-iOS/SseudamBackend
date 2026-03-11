/**
 * TravelModule
 *
 * 여행 CRUD, 멤버 관리, 여행 목록 조회를 담당한다.
 *
 * 이전 문제: CacheService를 직접 provide해 중복 인스턴스 생성.
 * 개선: CacheSharedModule(@Global)에서 CacheService 자동 주입.
 */
import { Module } from '@nestjs/common';
import { TravelController } from './travel.controller';
import { TravelService } from './travel.service';
import { OptimizedTravelService } from './optimized-travel.service';
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
  ],
  controllers: [TravelController],
  providers: [TravelService, OptimizedTravelService],
  exports: [TravelService, OptimizedTravelService],
})
export class TravelModule {}
