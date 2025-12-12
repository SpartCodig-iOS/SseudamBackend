"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DeviceTokenService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceTokenService = void 0;
const common_1 = require("@nestjs/common");
const pool_1 = require("../db/pool");
let DeviceTokenService = DeviceTokenService_1 = class DeviceTokenService {
    constructor() {
        this.logger = new common_1.Logger(DeviceTokenService_1.name);
    }
    /**
     * 비로그인 상태 토큰 등록: pendingKey 기준으로 저장/업데이트
     */
    async upsertAnonymousToken(pendingKey, deviceToken) {
        const token = deviceToken?.trim() ?? '';
        const key = pendingKey?.trim() ?? '';
        if (!token || token.length < 10 || !key) {
            this.logger.warn('Invalid anonymous token or pendingKey provided');
            return;
        }
        try {
            const pool = await (0, pool_1.getPool)();
            await pool.query(`INSERT INTO device_tokens (user_id, pending_key, device_token, platform, is_active, last_used_at, created_at, updated_at)
         VALUES (NULL, $1, $2, 'ios', true, NOW(), NOW(), NOW())
         ON CONFLICT (device_token)
         DO UPDATE SET
           pending_key = EXCLUDED.pending_key,
           is_active = true,
           last_used_at = NOW(),
           updated_at = NOW()`, [key, token]);
        }
        catch (error) {
            this.logger.error('Failed to upsert anonymous device token', {
                error: error instanceof Error ? error.message : String(error),
                pendingKey: key,
            });
        }
    }
    /**
     * pendingKey/deviceToken 기반으로 토큰을 특정 사용자에 매칭
     */
    async bindPendingTokensToUser(userId, pendingKey, deviceToken) {
        const token = deviceToken?.trim();
        const key = pendingKey?.trim();
        if (!token && !key)
            return;
        try {
            const pool = await (0, pool_1.getPool)();
            await pool.query(`UPDATE device_tokens
           SET user_id = $1,
               pending_key = NULL,
               is_active = true,
               last_used_at = NOW(),
               updated_at = NOW()
         WHERE ($2 IS NOT NULL AND device_token = $2)
            OR ($3 IS NOT NULL AND pending_key = $3)`, [userId, token || null, key || null]);
        }
        catch (error) {
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
    async upsertDeviceToken(userId, deviceToken) {
        if (!deviceToken || deviceToken.trim().length < 10) {
            this.logger.warn(`Invalid deviceToken provided for user ${userId}`);
            return;
        }
        const token = deviceToken.trim();
        try {
            const pool = await (0, pool_1.getPool)();
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                // device_token 기준으로 upsert (다른 사용자에 매핑되어 있어도 덮어씀)
                await client.query(`INSERT INTO device_tokens (user_id, device_token, platform, is_active, last_used_at, created_at, updated_at, pending_key)
           VALUES ($1, $2, 'ios', true, NOW(), NOW(), NOW(), NULL)
           ON CONFLICT (device_token)
           DO UPDATE SET
             user_id = EXCLUDED.user_id,
             is_active = true,
             last_used_at = NOW(),
             updated_at = NOW(),
             pending_key = NULL`, [userId, token]);
                // 동일 사용자에 매핑된 이전 토큰은 비활성화
                await client.query(`UPDATE device_tokens
             SET is_active = false,
                 updated_at = NOW()
           WHERE user_id = $1
             AND device_token <> $2
             AND is_active = true`, [userId, token]);
                await client.query('COMMIT');
            }
            catch (error) {
                await client.query('ROLLBACK');
                throw error;
            }
            finally {
                client.release();
            }
            this.logger.log(`Device token updated for user ${userId}`);
        }
        catch (error) {
            this.logger.error('Failed to upsert device token', {
                error: error instanceof Error ? error.message : String(error),
                userId,
                deviceTokenPrefix: token.substring(0, 8),
            });
        }
    }
    /**
     * 사용자의 활성화된 디바이스 토큰들을 조회합니다.
     */
    async getActiveDeviceTokens(userId) {
        try {
            const pool = await (0, pool_1.getPool)();
            const result = await pool.query('SELECT device_token FROM device_tokens WHERE user_id = $1 AND is_active = true ORDER BY last_used_at DESC', [userId]);
            return result.rows.map(row => row.device_token);
        }
        catch (error) {
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
    async getActiveDeviceTokensForUsers(userIds) {
        if (userIds.length === 0) {
            return {};
        }
        try {
            const pool = await (0, pool_1.getPool)();
            const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
            const result = await pool.query(`SELECT user_id, device_token
         FROM device_tokens
         WHERE user_id = ANY($1) AND is_active = true
         ORDER BY user_id, last_used_at DESC`, [userIds]);
            const tokensByUser = {};
            result.rows.forEach(row => {
                if (!tokensByUser[row.user_id]) {
                    tokensByUser[row.user_id] = [];
                }
                tokensByUser[row.user_id].push(row.device_token);
            });
            return tokensByUser;
        }
        catch (error) {
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
    async deactivateDeviceToken(deviceToken) {
        try {
            const pool = await (0, pool_1.getPool)();
            await pool.query('UPDATE device_tokens SET is_active = false, updated_at = NOW() WHERE device_token = $1', [deviceToken]);
            this.logger.log(`Device token deactivated: ${deviceToken.substring(0, 8)}...`);
        }
        catch (error) {
            this.logger.error('Failed to deactivate device token', {
                error: error instanceof Error ? error.message : String(error),
                deviceTokenPrefix: deviceToken.substring(0, 8),
            });
        }
    }
    /**
     * 사용자의 모든 디바이스 토큰을 비활성화합니다 (로그아웃 시 사용).
     */
    async deactivateAllUserTokens(userId) {
        try {
            const pool = await (0, pool_1.getPool)();
            const result = await pool.query('UPDATE device_tokens SET is_active = false, updated_at = NOW() WHERE user_id = $1 AND is_active = true', [userId]);
            this.logger.log(`Deactivated ${result.rowCount} device tokens for user ${userId}`);
        }
        catch (error) {
            this.logger.error('Failed to deactivate all user tokens', {
                error: error instanceof Error ? error.message : String(error),
                userId,
            });
        }
    }
    /**
     * 오래된 비활성 토큰들을 정리합니다 (30일 이상 사용되지 않은 토큰).
     */
    async cleanupOldTokens() {
        try {
            const pool = await (0, pool_1.getPool)();
            const result = await pool.query(`DELETE FROM device_tokens
         WHERE is_active = false
           AND updated_at < NOW() - INTERVAL '30 days'`);
            const deletedCount = result.rowCount || 0;
            if (deletedCount > 0) {
                this.logger.log(`Cleaned up ${deletedCount} old device tokens`);
            }
            return deletedCount;
        }
        catch (error) {
            this.logger.error('Failed to cleanup old tokens', {
                error: error instanceof Error ? error.message : String(error),
            });
            return 0;
        }
    }
};
exports.DeviceTokenService = DeviceTokenService;
exports.DeviceTokenService = DeviceTokenService = DeviceTokenService_1 = __decorate([
    (0, common_1.Injectable)()
], DeviceTokenService);
