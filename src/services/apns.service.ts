import { Injectable, Logger } from '@nestjs/common';
import * as apn from 'apn';
import { env } from '../config/env';

export interface APNSNotification {
  deviceToken: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  badge?: number;
  sound?: string;
}

@Injectable()
export class APNSService {
  private readonly logger = new Logger(APNSService.name);
  private apnProvider: apn.Provider | null = null;

  constructor() {
    this.initializeAPNS();
  }

  private initializeAPNS() {
    try {
      if (!env.applePrivateKey || !env.appleKeyId || !env.appleTeamId) {
        this.logger.warn('APNS configuration missing. Push notifications will be disabled.');
        return;
      }

      // APNS Auth Key 방식으로 초기화
      this.apnProvider = new apn.Provider({
        token: {
          key: env.applePrivateKey, // 환경변수에서 개인 키 로드
          keyId: env.appleKeyId,
          teamId: env.appleTeamId,
        },
        production: env.nodeEnv === 'production', // 프로덕션 여부에 따라 자동 설정
      });

      this.logger.log('APNS initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize APNS', error);
      this.apnProvider = null;
    }
  }

  async sendNotification(notification: APNSNotification): Promise<boolean> {
    if (!this.apnProvider) {
      this.logger.warn('APNS not configured. Skipping notification send.');
      return false;
    }

    try {
      const note = new apn.Notification();

      // 알림 내용 설정
      note.alert = {
        title: notification.title,
        body: notification.body,
      };

      // 배지 설정 (선택적)
      if (notification.badge !== undefined) {
        note.badge = notification.badge;
      }

      // 사운드 설정 (기본값: default)
      note.sound = notification.sound || 'default';

      // 커스텀 데이터 설정
      if (notification.data) {
        note.payload = notification.data;
      }

      // 만료 시간 설정 (1일)
      note.expiry = Math.floor(Date.now() / 1000) + 24 * 60 * 60;

      // 높은 우선순위로 설정
      note.priority = 10;

      // APNS 토픽 설정 (번들 ID)
      note.topic = 'io.sseudam.co';

      // 알림 전송
      const result = await this.apnProvider.send(note, notification.deviceToken);

      if (result.sent && result.sent.length > 0) {
        this.logger.log(`APNS notification sent successfully to ${notification.deviceToken.substring(0, 8)}...`);
        return true;
      } else if (result.failed && result.failed.length > 0) {
        const failure = result.failed[0];
        this.logger.error(`APNS notification failed: ${failure.error}`, {
          deviceToken: notification.deviceToken.substring(0, 8),
          status: failure.status,
          response: failure.response,
        });
        return false;
      }

      this.logger.warn('APNS result is unclear', { result });
      return false;
    } catch (error) {
      this.logger.error('Error sending APNS notification', {
        error: error instanceof Error ? error.message : String(error),
        deviceToken: notification.deviceToken.substring(0, 8),
      });
      return false;
    }
  }

  async sendNotificationToMultiple(
    deviceTokens: string[],
    title: string,
    body: string,
    data?: Record<string, any>
  ): Promise<{ success: number; failed: number }> {
    if (!this.apnProvider || deviceTokens.length === 0) {
      return { success: 0, failed: 0 };
    }

    let success = 0;
    let failed = 0;

    // 병렬로 여러 디바이스에 전송
    const promises = deviceTokens.map(async (deviceToken) => {
      const result = await this.sendNotification({
        deviceToken,
        title,
        body,
        data,
      });
      return result ? 'success' : 'failed';
    });

    const results = await Promise.allSettled(promises);

    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value === 'success') {
        success++;
      } else {
        failed++;
      }
    });

    this.logger.log(`Batch APNS notification completed: ${success} success, ${failed} failed`);
    return { success, failed };
  }

  async shutdown() {
    if (this.apnProvider) {
      this.apnProvider.shutdown();
      this.logger.log('APNS provider shutdown');
    }
  }
}