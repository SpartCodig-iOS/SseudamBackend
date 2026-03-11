import { Injectable, Logger } from '@nestjs/common';
import { DeviceTokenRepository } from '../repositories/device-token.repository';

@Injectable()
export class DeviceTokenService {
  private readonly logger = new Logger(DeviceTokenService.name);

  constructor(private readonly deviceTokenRepository: DeviceTokenRepository) {}

  /**
   * 비로그인 상태 토큰 등록: pendingKey 기준으로 저장/업데이트합니다.
   */
  async upsertAnonymousToken(pendingKey: string, deviceToken: string): Promise<void> {
    const start = Date.now();
    const token = deviceToken?.trim() ?? '';
    const key = pendingKey?.trim() ?? '';

    if (!token || token.length < 10 || !key) {
      this.logger.warn('Invalid anonymous token or pendingKey provided');
      return;
    }

    try {
      await this.deviceTokenRepository.upsertAnonymousToken(key, token);

      const duration = Date.now() - start;
      if (duration > 300) {
        this.logger.warn(
          `[perf] upsertAnonymousToken slow: ${duration}ms (pendingKey=${key})`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to upsert anonymous device token', {
        error: error instanceof Error ? error.message : String(error),
        pendingKey: key,
      });
    }
  }

  /**
   * pendingKey/deviceToken 기반으로 토큰을 특정 사용자에 매칭합니다.
   * 트랜잭션으로 처리되며 기존 활성 토큰은 비활성화됩니다.
   */
  async bindPendingTokensToUser(
    userId: string,
    pendingKey?: string,
    deviceToken?: string,
  ): Promise<void> {
    const token = deviceToken?.trim();
    const key = pendingKey?.trim();

    if (!token && !key) return;

    try {
      await this.deviceTokenRepository.bindPendingTokensToUser(userId, key, token);
    } catch (error) {
      this.logger.error('Failed to bind pending tokens', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
    }
  }

  /**
   * 디바이스 토큰을 저장하거나 업데이트합니다.
   * 동일 device_token이 있으면 user_id를 덮어씁니다.
   * 트랜잭션으로 처리되며 같은 사용자의 이전 활성 토큰은 비활성화됩니다.
   */
  async upsertDeviceToken(userId: string, deviceToken: string): Promise<void> {
    const start = Date.now();

    if (!deviceToken || deviceToken.trim().length < 10) {
      this.logger.warn(`Invalid deviceToken provided for user ${userId}`);
      return;
    }

    const token = deviceToken.trim();

    try {
      await this.deviceTokenRepository.upsertDeviceToken(userId, token);

      const duration = Date.now() - start;
      if (duration > 300) {
        this.logger.warn(
          `[perf] upsertDeviceToken slow: ${duration}ms (user=${userId}, tokenPrefix=${token.substring(0, 8)})`,
        );
      }
      this.logger.log(`Device token updated for user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to upsert device token', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        deviceTokenPrefix: token.substring(0, 8),
      });
    }
  }

  /**
   * 사용자의 활성화된 디바이스 토큰 목록을 조회합니다.
   */
  async getActiveDeviceTokens(userId: string): Promise<string[]> {
    try {
      return await this.deviceTokenRepository.findActiveTokensByUserId(userId);
    } catch (error) {
      this.logger.error('Failed to get device tokens', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
      return [];
    }
  }

  /**
   * 여러 사용자의 활성화된 디바이스 토큰을 조회합니다.
   */
  async getActiveDeviceTokensForUsers(
    userIds: string[],
  ): Promise<Record<string, string[]>> {
    if (userIds.length === 0) return {};

    try {
      return await this.deviceTokenRepository.findActiveTokensByUserIds(userIds);
    } catch (error) {
      this.logger.error('Failed to get device tokens for multiple users', {
        error: error instanceof Error ? error.message : String(error),
        userCount: userIds.length,
      });
      return {};
    }
  }

  /**
   * 특정 디바이스 토큰을 비활성화합니다 (APNS 오류 응답 처리 시 사용).
   */
  async deactivateDeviceToken(deviceToken: string): Promise<void> {
    try {
      await this.deviceTokenRepository.deactivateToken(deviceToken);
      this.logger.log(`Device token deactivated: ${deviceToken.substring(0, 8)}...`);
    } catch (error) {
      this.logger.error('Failed to deactivate device token', {
        error: error instanceof Error ? error.message : String(error),
        deviceTokenPrefix: deviceToken.substring(0, 8),
      });
    }
  }

  /**
   * 사용자의 모든 디바이스 토큰을 비활성화합니다 (로그아웃 시 사용).
   */
  async deactivateAllUserTokens(userId: string): Promise<void> {
    try {
      const count = await this.deviceTokenRepository.deactivateAllTokensByUserId(userId);
      this.logger.log(`Deactivated ${count} device tokens for user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to deactivate all user tokens', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
    }
  }

  /**
   * 오래된 비활성 토큰들을 정리합니다 (30일 이상 사용되지 않은 토큰).
   */
  async cleanupOldTokens(): Promise<number> {
    try {
      const deletedCount = await this.deviceTokenRepository.deleteOldInactiveTokens();
      if (deletedCount > 0) {
        this.logger.log(`Cleaned up ${deletedCount} old device tokens`);
      }
      return deletedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup old tokens', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }
}
