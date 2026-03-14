import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceTokenEntity } from './entities/device-token.entity';
import { User } from '../user/entities/user.entity';

export interface PushNotification {
  title: string;
  body: string;
  data?: Record<string, any>;
  badge?: number;
  sound?: string;
}

export interface NotificationTarget {
  userId?: string;
  deviceTokens?: string[];
  topic?: string;
  userIds?: string[];
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(DeviceTokenEntity)
    private readonly deviceTokenRepository: Repository<DeviceTokenEntity>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * 푸시 알림 발송
   */
  async sendPushNotification(
    target: NotificationTarget,
    notification: PushNotification
  ): Promise<{ success: number; failed: number }> {
    try {
      const deviceTokens = await this.getTargetDeviceTokens(target);

      if (deviceTokens.length === 0) {
        this.logger.warn('No device tokens found for notification');
        return { success: 0, failed: 0 };
      }

      // Firebase FCM 또는 다른 푸시 서비스 구현
      // 현재는 로깅만 수행
      this.logger.log(`Would send notification to ${deviceTokens.length} devices: ${notification.title}`);

      // 성공으로 가정
      return { success: deviceTokens.length, failed: 0 };
    } catch (error) {
      this.logger.error('Failed to send push notification:', error);
      return { success: 0, failed: 1 };
    }
  }

  /**
   * 사용자에게 알림 발송
   */
  async sendToUser(userId: string, notification: PushNotification): Promise<boolean> {
    try {
      const result = await this.sendPushNotification({ userId }, notification);
      return result.success > 0;
    } catch (error) {
      this.logger.error(`Failed to send notification to user ${userId}:`, error);
      return false;
    }
  }

  /**
   * 여러 사용자에게 알림 발송
   */
  async sendToUsers(userIds: string[], notification: PushNotification): Promise<{ success: number; failed: number }> {
    try {
      const result = await this.sendPushNotification({ userIds }, notification);
      return result;
    } catch (error) {
      this.logger.error('Failed to send notification to users:', error);
      return { success: 0, failed: userIds.length };
    }
  }

  /**
   * 토픽으로 알림 발송
   */
  async sendToTopic(topic: string, notification: PushNotification): Promise<boolean> {
    try {
      this.logger.log(`Would send notification to topic ${topic}: ${notification.title}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send notification to topic ${topic}:`, error);
      return false;
    }
  }

  /**
   * 대상 디바이스 토큰 조회
   */
  private async getTargetDeviceTokens(target: NotificationTarget): Promise<string[]> {
    const tokens: string[] = [];

    // 직접 지정된 디바이스 토큰
    if (target.deviceTokens) {
      tokens.push(...target.deviceTokens);
    }

    // 단일 사용자
    if (target.userId) {
      const userTokens = await this.deviceTokenRepository.find({
        where: { userId: target.userId, isActive: true },
        select: ['token']
      });
      tokens.push(...userTokens.map(t => t.token));
    }

    // 다중 사용자
    if (target.userIds && target.userIds.length > 0) {
      const userTokens = await this.deviceTokenRepository.find({
        where: {
          userId: target.userIds as any, // TypeORM In operator
          isActive: true
        },
        select: ['token']
      });
      tokens.push(...userTokens.map(t => t.token));
    }

    // 중복 제거
    return [...new Set(tokens)];
  }

  /**
   * 디바이스 토큰 등록
   */
  async registerDeviceToken(
    userId: string,
    token: string,
    deviceInfo: {
      platform: 'ios' | 'android';
      deviceId?: string;
      appVersion?: string;
    }
  ): Promise<void> {
    try {
      // 기존 토큰 비활성화
      await this.deviceTokenRepository.update(
        { userId, token },
        { isActive: false }
      );

      // 새 토큰 등록
      const deviceToken = this.deviceTokenRepository.create({
        userId,
        token,
        platform: deviceInfo.platform,
        deviceId: deviceInfo.deviceId,
        appVersion: deviceInfo.appVersion,
        isActive: true,
      });

      await this.deviceTokenRepository.save(deviceToken);

      this.logger.debug(`Device token registered for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to register device token for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * 디바이스 토큰 제거
   */
  async removeDeviceToken(userId: string, token: string): Promise<void> {
    try {
      await this.deviceTokenRepository.update(
        { userId, token },
        { isActive: false }
      );

      this.logger.debug(`Device token removed for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to remove device token for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * 사용자의 모든 디바이스 토큰 제거
   */
  async removeAllUserTokens(userId: string): Promise<void> {
    try {
      await this.deviceTokenRepository.update(
        { userId },
        { isActive: false }
      );

      this.logger.debug(`All device tokens removed for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to remove all tokens for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * 만료된 토큰 정리
   */
  async cleanupExpiredTokens(): Promise<number> {
    try {
      // 30일 이상 된 비활성 토큰 삭제
      const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const result = await this.deviceTokenRepository
        .createQueryBuilder()
        .delete()
        .where('isActive = false AND updatedAt < :cutoffDate', { cutoffDate })
        .execute();

      const deletedCount = result.affected || 0;

      if (deletedCount > 0) {
        this.logger.log(`Cleaned up ${deletedCount} expired device tokens`);
      }

      return deletedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup expired tokens:', error);
      return 0;
    }
  }
}