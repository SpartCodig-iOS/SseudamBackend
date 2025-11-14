"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionService = void 0;
const common_1 = require("@nestjs/common");
const pool_1 = require("../db/pool");
let SessionService = class SessionService {
    constructor() {
        this.defaultTTLHours = 24 * 30;
    }
    async getClient() {
        return (0, pool_1.getPool)();
    }
    async createSession(userId, loginType) {
        const pool = await this.getClient();
        const result = await pool.query(`INSERT INTO user_sessions (user_id, login_type, expires_at, last_seen_at)
       VALUES ($1, $2, NOW() + INTERVAL '${this.defaultTTLHours} hours', NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET session_id = gen_random_uuid(),
             login_type = EXCLUDED.login_type,
             expires_at = EXCLUDED.expires_at,
             last_seen_at = EXCLUDED.last_seen_at,
             created_at = user_sessions.created_at
       RETURNING session_id::text AS session_id,
                 user_id::text AS user_id,
                 login_type,
                 created_at::text,
                 last_seen_at::text,
                 expires_at::text`, [userId, loginType]);
        const row = result.rows[0];
        return {
            sessionId: row.session_id,
            userId: row.user_id,
            loginType: row.login_type,
            createdAt: row.created_at,
            lastSeenAt: row.last_seen_at,
            expiresAt: row.expires_at,
        };
    }
    async getSession(sessionId) {
        const pool = await this.getClient();
        const result = await pool.query(`SELECT session_id::text AS session_id,
              user_id::text AS user_id,
              login_type,
              created_at::text,
              last_seen_at::text,
              expires_at::text
       FROM user_sessions
       WHERE session_id = $1
         AND expires_at > NOW()
       LIMIT 1`, [sessionId]);
        const row = result.rows[0];
        if (!row)
            return null;
        return {
            sessionId: row.session_id,
            userId: row.user_id,
            loginType: row.login_type,
            createdAt: row.created_at,
            lastSeenAt: row.last_seen_at,
            expiresAt: row.expires_at,
        };
    }
    async touchSession(sessionId) {
        const pool = await this.getClient();
        await pool.query(`UPDATE user_sessions
       SET last_seen_at = NOW()
       WHERE session_id = $1`, [sessionId]);
    }
    async deleteSession(sessionId) {
        const pool = await this.getClient();
        const result = await pool.query(`DELETE FROM user_sessions WHERE session_id = $1`, [sessionId]);
        return (result.rowCount ?? 0) > 0;
    }
    async deleteUserSessions(userId) {
        const pool = await this.getClient();
        const result = await pool.query(`DELETE FROM user_sessions WHERE user_id = $1`, [userId]);
        return result.rowCount ?? 0;
    }
};
exports.SessionService = SessionService;
exports.SessionService = SessionService = __decorate([
    (0, common_1.Injectable)()
], SessionService);
