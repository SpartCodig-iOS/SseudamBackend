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

interface APNSendResult {
  success: boolean;
  reason?: string;
  detail?: any;
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

      // 환경변수에 literal "\n" 이 포함된 경우 실제 개행으로 치환
      const normalizedKey = env.applePrivateKey.includes('\\n')
        ? env.applePrivateKey.replace(/\\n/g, '\n')
        : env.applePrivateKey;

      // APNS Auth Key 방식으로 초기화
      const useProduction = env.appleApnsProduction ?? env.nodeEnv === 'production';

      this.apnProvider = new apn.Provider({
        token: {
          key: normalizedKey, // 환경변수에서 개인 키 로드
          keyId: env.appleKeyId,
          teamId: env.appleTeamId,
        },
        production: useProduction, // 프로덕션 여부 환경변수로 제어
      });

      this.logger.log(`APNS initialized successfully (Production: ${useProduction})`);
    } catch (error) {
      this.logger.error('Failed to initialize APNS', error);
      this.apnProvider = null;
    }
  }

  async sendNotification(notification: APNSNotification): Promise<boolean> {
    const result = await this.sendNotificationWithResult(notification);
    return result.success;
  }

  async sendNotificationWithResult(notification: APNSNotification): Promise<APNSendResult> {
    if (!this.apnProvider) {
      this.logger.warn('APNS not configured. Skipping notification send.');
      return { success: false, reason: 'APNS_NOT_CONFIGURED' };
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
      note.topic = env.appleBundleId || 'io.sseudam.co';

      // 알림 전송
      this.logger.debug(`Sending APNS notification to ${notification.deviceToken.substring(0, 8)}... with topic: ${note.topic}`);
      const result = await this.apnProvider.send(note, notification.deviceToken);

      this.logger.debug('APNS send result:', {
        sent: result.sent?.length || 0,
        failed: result.failed?.length || 0,
        deviceToken: notification.deviceToken.substring(0, 8)
      });

      if (result.sent && result.sent.length > 0) {
        this.logger.log(`APNS notification sent successfully to ${notification.deviceToken.substring(0, 8)}...`);
        return { success: true };
      } else if (result.failed && result.failed.length > 0) {
        const failure = result.failed[0];
        const reason =
          (failure?.response as any)?.reason ||
          (failure?.status ? `status_${failure.status}` : undefined) ||
          (failure?.error instanceof Error ? failure.error.message : String(failure?.error ?? 'unknown_error'));
        this.logger.error(`APNS notification failed: ${reason}`, {
          deviceToken: notification.deviceToken.substring(0, 8),
          status: failure.status,
          response: failure.response,
          device: failure.device
        });
        return { success: false, reason, detail: failure };
      }

      this.logger.warn('APNS result is unclear', { result });
      return { success: false, reason: 'UNKNOWN_RESULT', detail: result };
    } catch (error) {
      this.logger.error('Error sending APNS notification', {
        error: error instanceof Error ? error.message : String(error),
        deviceToken: notification.deviceToken.substring(0, 8),
      });
      return { success: false, reason: error instanceof Error ? error.message : String(error) };
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
