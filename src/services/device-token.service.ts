import { Injectable, Logger } from '@nestjs/common';
import { getPool } from '../db/pool';

@Injectable()
export class DeviceTokenService {
  private readonly logger = new Logger(DeviceTokenService.name);

  /**
   * 비로그인 상태 토큰 등록: pendingKey 기준으로 저장/업데이트
   */
  async upsertAnonymousToken(pendingKey: string, deviceToken: string): Promise<void> {
    const token = deviceToken?.trim() ?? '';
    const key = pendingKey?.trim() ?? '';
    if (!token || token.length < 10 || !key) {
      this.logger.warn('Invalid anonymous token or pendingKey provided');
      return;
    }
    try {
      const pool = await getPool();
      await pool.query(
        `INSERT INTO device_tokens (user_id, pending_key, device_token, platform, is_active, last_used_at, created_at, updated_at)
         VALUES (NULL, $1, $2, 'ios', true, NOW(), NOW(), NOW())
         ON CONFLICT (device_token)
         DO UPDATE SET
           pending_key = EXCLUDED.pending_key,
           is_active = true,
           last_used_at = NOW(),
           updated_at = NOW()`,
        [key, token],
      );
    } catch (error) {
      this.logger.error('Failed to upsert anonymous device token', {
        error: error instanceof Error ? error.message : String(error),
        pendingKey: key,
      });
    }
  }

  /**
   * pendingKey/deviceToken 기반으로 토큰을 특정 사용자에 매칭
   */
  async bindPendingTokensToUser(userId: string, pendingKey?: string, deviceToken?: string): Promise<void> {
    const token = deviceToken?.trim();
    const key = pendingKey?.trim();
    if (!token && !key) return;
    try {
      const pool = await getPool();
      await pool.query(
        `UPDATE device_tokens
           SET user_id = $1,
               pending_key = NULL,
               is_active = true,
               last_used_at = NOW(),
               updated_at = NOW()
         WHERE ($2 IS NOT NULL AND device_token = $2)
            OR ($3 IS NOT NULL AND pending_key = $3)`,
        [userId, token || null, key || null],
      );
    } catch (error) {
      this.logger.error('Failed to bind pending tokens', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
    }
  }

  /**
   * 디바이스 토큰을 저장하거나 업데이트합니다.
   * 같은 user_id + device_token 조합이면 last_used_at만 업데이트하고,
   * 새로운 토큰이면 추가합니다.
   */
  async upsertDeviceToken(userId: string, deviceToken: string): Promise<void> {
    if (!deviceToken || deviceToken.trim().length < 10) {
      this.logger.warn(`Invalid deviceToken provided for user ${userId}`);
      return;
    }

    try {
      const pool = await getPool();

      // 기존 토큰이 있는지 확인하고 업데이트, 없으면 새로 추가
      await pool.query(
        `INSERT INTO device_tokens (user_id, device_token, platform, is_active, last_used_at, created_at, updated_at, pending_key)
         VALUES ($1, $2, 'ios', true, NOW(), NOW(), NOW(), NULL)
         ON CONFLICT (user_id, device_token)
         DO UPDATE SET
           is_active = true,
           last_used_at = NOW(),
           updated_at = NOW(),
           pending_key = NULL`,
        [userId, deviceToken.trim()]
      );

      this.logger.log(`Device token updated for user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to upsert device token', {
        error: error instanceof Error ? error.message : String(error),
        userId,
        deviceTokenPrefix: deviceToken.substring(0, 8),
      });
    }
  }

  /**
   * 사용자의 활성화된 디바이스 토큰들을 조회합니다.
   */
  async getActiveDeviceTokens(userId: string): Promise<string[]> {
    try {
      const pool = await getPool();
      const result = await pool.query(
        'SELECT device_token FROM device_tokens WHERE user_id = $1 AND is_active = true ORDER BY last_used_at DESC',
        [userId]
      );

      return result.rows.map(row => row.device_token);
    } catch (error) {
      this.logger.error('Failed to get device tokens', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
      return [];
    }
  }

  /**
   * 여러 사용자의 활성화된 디바이스 토큰들을 조회합니다.
   */
  async getActiveDeviceTokensForUsers(userIds: string[]): Promise<Record<string, string[]>> {
    if (userIds.length === 0) {
      return {};
    }

    try {
      const pool = await getPool();
      const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
      const result = await pool.query(
        `SELECT user_id, device_token
         FROM device_tokens
         WHERE user_id = ANY($1) AND is_active = true
         ORDER BY user_id, last_used_at DESC`,
        [userIds]
      );

      const tokensByUser: Record<string, string[]> = {};
      result.rows.forEach(row => {
        if (!tokensByUser[row.user_id]) {
          tokensByUser[row.user_id] = [];
        }
        tokensByUser[row.user_id].push(row.device_token);
      });

      return tokensByUser;
    } catch (error) {
      this.logger.error('Failed to get device tokens for multiple users', {
        error: error instanceof Error ? error.message : String(error),
        userCount: userIds.length,
      });
      return {};
    }
  }

  /**
   * 특정 디바이스 토큰을 비활성화합니다.
   */
  async deactivateDeviceToken(deviceToken: string): Promise<void> {
    try {
      const pool = await getPool();
      await pool.query(
        'UPDATE device_tokens SET is_active = false, updated_at = NOW() WHERE device_token = $1',
        [deviceToken]
      );

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
      const pool = await getPool();
      const result = await pool.query(
        'UPDATE device_tokens SET is_active = false, updated_at = NOW() WHERE user_id = $1 AND is_active = true',
        [userId]
      );

      this.logger.log(`Deactivated ${result.rowCount} device tokens for user ${userId}`);
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
      const pool = await getPool();
      const result = await pool.query(
        `DELETE FROM device_tokens
         WHERE is_active = false
           AND updated_at < NOW() - INTERVAL '30 days'`
      );

      const deletedCount = result.rowCount || 0;
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
