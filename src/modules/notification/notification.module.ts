/**
 * NotificationModule
 *
 * 푸시 알림 파이프라인을 한 곳에서 관리한다.
 * - APNSService: Apple APNS 연동
 * - DeviceTokenService: 디바이스 토큰 저장/조회
 * - PushNotificationService: 이벤트 기반 알림 발송 조정자
 *
 * 이벤트 플로우:
 *   TravelExpenseService --emit--> 'expense.added'
 *   PushNotificationService --@OnEvent--> 디바이스 토큰 조회 -> APNS 전송
 *
 * 규칙:
 *  1. CoreModule의 EventEmitter2가 @Global()로 주입된다.
 *  2. DatabaseModule을 import해 DeviceTokenRepository를 제공받는다.
 *  3. 알림 로직 외 비즈니스 로직을 포함하지 않는다.
 */
import { Module } from '@nestjs/common';
import { APNSService } from './services/apns.service';
import { DeviceTokenService } from '../oauth/services/device-token.service';
import { PushNotificationService } from './services/push-notification.service';
import { DatabaseModule } from '../database/database.module';

/**
 * NotificationModule
 *
 * DatabaseModule을 import해 DeviceTokenRepository를 제공받습니다.
 * DeviceTokenService는 Pool 대신 DeviceTokenRepository를 통해 DB에 접근합니다.
 */
@Module({
  imports: [DatabaseModule],
  providers: [
    APNSService,
    DeviceTokenService,
    PushNotificationService,
  ],
  exports: [
    APNSService,
    DeviceTokenService,
    PushNotificationService,
  ],
})
export class NotificationModule {}
