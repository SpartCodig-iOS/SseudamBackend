import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationService } from './services';
import { NotificationController } from './notification.controller';
import { DeviceTokenEntity } from './entities/device-token.entity';
import { User } from '../user/entities/user.entity';

/**
 * NotificationModule
 *
 * 푸시 알림 관련 기능을 제공하는 모듈
 * - NotificationService: 푸시 알림 발송 서비스
 * - NotificationController: 알림 설정 관리 컨트롤러
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      DeviceTokenEntity,
      User,
    ]),
  ],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}