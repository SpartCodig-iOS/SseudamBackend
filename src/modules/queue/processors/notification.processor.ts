import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUES, JOB_TYPES } from '../../../common/constants/queue.constants';
import { NotificationJobData } from '../../../common/events/travel.events';

@Processor(QUEUES.NOTIFICATION)
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);

  @Process(JOB_TYPES.SEND_PUSH_NOTIFICATION)
  async sendPushNotification(job: Job<NotificationJobData>) {
    const { userIds, title, body, data, badge } = job.data;

    try {
      this.logger.log(`🔥 [BACKGROUND] Sending push notification to ${userIds.length} users: ${title}`);

      // 🚀 TODO: 실제 푸시 알림 서비스 연동 (FCM, APNS 등)
      // await this.fcmService.sendToUsers(userIds, { title, body, data, badge });

      // 🎯 현재는 로그만 출력 (나중에 실제 푸시 서비스 연동)
      for (const userId of userIds) {
        this.logger.log(`📱 Push notification sent to user ${userId}: ${title}`);
      }

      // 🎉 성공 메트릭 기록
      this.logger.log(`✅ Push notification job completed for ${userIds.length} users`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Failed to send push notification: ${errorMessage}`, error instanceof Error ? error.stack : undefined);
      throw error; // Bull이 재시도 할 수 있게 에러 던지기
    }
  }

  @Process(JOB_TYPES.SEND_TRAVEL_INVITE)
  async sendTravelInviteNotification(job: Job<NotificationJobData>) {
    const { userIds, title, body, data } = job.data;

    try {
      this.logger.log(`🔥 [BACKGROUND] Sending travel invite notification to ${userIds.length} users`);

      // 🚀 여행 초대 특별 알림 처리
      for (const userId of userIds) {
        // 실제 푸시 알림 + 앱내 알림 저장
        // await this.fcmService.sendHighPriorityNotification(userId, { title, body, data });
        // await this.inAppNotificationService.create(userId, { title, body, type: 'travel_invite' });

        this.logger.log(`📨 Travel invite notification sent to user ${userId}`);
      }

      this.logger.log(`✅ Travel invite notification job completed`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Failed to send travel invite notification: ${errorMessage}`, error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  @Process(JOB_TYPES.SEND_EXPENSE_NOTIFICATION)
  async sendExpenseNotification(job: Job<NotificationJobData>) {
    const { userIds, title, body, data } = job.data;

    try {
      this.logger.log(`🔥 [BACKGROUND] Sending expense notification to ${userIds.length} users`);

      // 🚀 경비 알림 특별 처리 (배지 업데이트 포함)
      for (const userId of userIds) {
        // await this.fcmService.sendWithBadgeUpdate(userId, { title, body, data });

        this.logger.log(`💰 Expense notification sent to user ${userId}`);
      }

      this.logger.log(`✅ Expense notification job completed`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Failed to send expense notification: ${errorMessage}`, error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }
}