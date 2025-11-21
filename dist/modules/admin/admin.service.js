"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AdminService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const pool_1 = require("../../db/pool");
const cacheService_1 = require("../../services/cacheService");
const sessionService_1 = require("../../services/sessionService");
let AdminService = AdminService_1 = class AdminService {
    constructor(cacheService, sessionService) {
        this.cacheService = cacheService;
        this.sessionService = sessionService;
        this.logger = new common_1.Logger(AdminService_1.name);
    }
    mapProfileRow(row) {
        return {
            id: row.id,
            email: row.email,
            name: row.name,
            avatar_url: row.avatar_url,
            username: row.username,
            role: row.role ?? 'user',
            created_at: row.created_at,
            updated_at: row.updated_at,
            password_hash: '',
        };
    }
    async updateUserRole(targetUserId, role, actorUserId) {
        const pool = await (0, pool_1.getPool)();
        const client = await pool.connect();
        let updatedRow;
        try {
            await client.query('BEGIN');
            const result = await client.query(`UPDATE profiles
         SET role = $2,
             updated_at = NOW()
        WHERE id = $1
         RETURNING id::text,
                   email,
                   name,
                   avatar_url,
                   username,
                   role,
                   created_at,
                   updated_at`, [targetUserId, role]);
            if (result.rowCount === 0) {
                throw new common_1.NotFoundException('User not found');
            }
            updatedRow = result.rows[0];
            // 사용자가 참여 중인 모든 여행 멤버 역할도 동일하게 업데이트
            await client.query(`UPDATE travel_members
         SET role = $2
         WHERE user_id = $1`, [targetUserId, role]);
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
        // 권한 변경 즉시 세션/캐시 무효화 (재로그인 유도)
        await Promise.all([
            this.sessionService.deleteUserSessions(targetUserId).catch((err) => this.logger.warn(`Failed to revoke sessions for ${targetUserId}: ${err.message}`)),
            this.cacheService.invalidateUserCache(targetUserId).catch((err) => this.logger.warn(`Failed to invalidate cache for ${targetUserId}: ${err.message}`)),
        ]);
        this.logger.log(`User ${targetUserId} role updated to ${role} by ${actorUserId}`);
        return this.mapProfileRow(updatedRow);
    }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = AdminService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [cacheService_1.CacheService,
        sessionService_1.SessionService])
], AdminService);
