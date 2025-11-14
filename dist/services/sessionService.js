"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var SessionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionService = void 0;
const common_1 = require("@nestjs/common");
const pool_1 = require("../db/pool");
let SessionService = SessionService_1 = class SessionService {
    constructor() {
        this.logger = new common_1.Logger(SessionService_1.name);
        this.defaultTTLHours = 24 * 30;
        this.CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10분마다 만료 세션 정리
        this.lastCleanupRun = 0;
        // 세션 캐시: 10분 TTL, 최대 2000개 세션
        this.sessionCache = new Map();
        this.SESSION_CACHE_TTL = 10 * 60 * 1000; // 10분
        this.MAX_CACHE_SIZE = 2000;
    }
    async getClient() {
        return (0, pool_1.getPool)();
    }
    // 세션 캐시 관리
    getCachedSession(sessionId) {
        const cached = this.sessionCache.get(sessionId);
        if (!cached)
            return null;
        if (Date.now() > cached.expiresAt) {
            this.sessionCache.delete(sessionId);
            return null;
        }
        // 세션이 만료되었는지 확인
        if (new Date(cached.data.expiresAt) <= new Date()) {
            this.sessionCache.delete(sessionId);
            return null;
        }
        return cached.data;
    }
    setCachedSession(sessionId, session) {
        // 캐시 크기 제한
        if (this.sessionCache.size >= this.MAX_CACHE_SIZE) {
            // 가장 오래된 항목들 제거 (최대 100개씩)
            const entries = Array.from(this.sessionCache.entries());
            const toDelete = entries.slice(0, Math.min(100, entries.length));
            toDelete.forEach(([key]) => this.sessionCache.delete(key));
        }
        this.sessionCache.set(sessionId, {
            data: session,
            expiresAt: Date.now() + this.SESSION_CACHE_TTL
        });
    }
    clearCachedSession(sessionId) {
        this.sessionCache.delete(sessionId);
    }
    clearUserSessions(userId) {
        // 특정 사용자의 모든 세션을 캐시에서 제거
        for (const [sessionId, cached] of this.sessionCache.entries()) {
            if (cached.data.userId === userId) {
                this.sessionCache.delete(sessionId);
            }
        }
    }
    mapRowToSession(row) {
        const createdAt = row.created_at;
        const lastSeenAt = row.last_seen_at;
        const expiresAt = row.expires_at;
        const revokedAt = row.revoked_at ?? null;
        const now = new Date();
        const expiresDate = new Date(expiresAt);
        const revokedDate = revokedAt ? new Date(revokedAt) : null;
        let status = 'active';
        if (revokedDate) {
            status = 'revoked';
        }
        else if (expiresDate <= now) {
            status = 'expired';
        }
        return {
            sessionId: row.session_id,
            userId: row.user_id,
            loginType: row.login_type,
            createdAt,
            lastSeenAt,
            expiresAt,
            revokedAt,
            status,
            isActive: status === 'active',
        };
    }
    purgeExpiredCacheEntries() {
        const now = new Date();
        for (const [sessionId, cached] of this.sessionCache.entries()) {
            if (new Date(cached.data.expiresAt) <= now) {
                this.sessionCache.delete(sessionId);
            }
        }
    }
    async cleanupExpiredSessions(force = false) {
        this.purgeExpiredCacheEntries();
        const now = Date.now();
        if (!force && now - this.lastCleanupRun < this.CLEANUP_INTERVAL_MS) {
            return;
        }
        this.lastCleanupRun = now;
        try {
            const pool = await this.getClient();
            const result = await pool.query(`DELETE FROM user_sessions WHERE expires_at <= NOW()`);
            if ((result.rowCount ?? 0) > 0) {
                this.logger.debug(`Cleaned up ${result.rowCount} expired sessions from storage`);
            }
        }
        catch (error) {
            this.logger.warn(`Failed to clean expired sessions: ${error.message}`);
        }
    }
    async createSession(userId, loginType) {
        const startTime = Date.now();
        // 기존 사용자 세션들을 캐시에서 제거 (빠른 메모리 작업)
        this.clearUserSessions(userId);
        // 만료 세션 정리는 백그라운드로 (첫 로그인 속도 향상)
        this.cleanupExpiredSessions().catch(err => this.logger.warn('Background session cleanup failed', err));
        const pool = await this.getClient();
        // 최적화된 세션 생성 쿼리 (더 빠른 UPSERT)
        const result = await pool.query(`WITH new_session AS (
         INSERT INTO user_sessions (user_id, login_type, expires_at, last_seen_at, revoked_at)
         VALUES ($1, $2, NOW() + INTERVAL '${this.defaultTTLHours} hours', NOW(), NULL)
         ON CONFLICT (user_id) DO UPDATE
           SET session_id = gen_random_uuid(),
               login_type = EXCLUDED.login_type,
               expires_at = EXCLUDED.expires_at,
               last_seen_at = EXCLUDED.last_seen_at,
               revoked_at = NULL
         RETURNING session_id, user_id, login_type, created_at, last_seen_at, expires_at, revoked_at
       )
       SELECT
         session_id::text AS session_id,
         user_id::text AS user_id,
         login_type,
         created_at::text,
         last_seen_at::text,
         expires_at::text,
         revoked_at::text
       FROM new_session`, [userId, loginType]);
        const session = this.mapRowToSession(result.rows[0]);
        // 새 세션을 캐시에 저장
        this.setCachedSession(session.sessionId, session);
        const duration = Date.now() - startTime;
        this.logger.debug(`Fast session created in ${duration}ms for user ${userId}`);
        return session;
    }
    async getSession(sessionId) {
        await this.cleanupExpiredSessions();
        // 캐시에서 먼저 확인
        const cachedSession = this.getCachedSession(sessionId);
        if (cachedSession) {
            return cachedSession;
        }
        const pool = await this.getClient();
        const result = await pool.query(`SELECT session_id::text AS session_id,
              user_id::text AS user_id,
              login_type,
              created_at::text,
              last_seen_at::text,
              expires_at::text,
              revoked_at::text
       FROM user_sessions
       WHERE session_id = $1
       LIMIT 1`, [sessionId]);
        const row = result.rows[0];
        if (!row)
            return null;
        const session = this.mapRowToSession(row);
        // 캐시에 저장
        this.setCachedSession(sessionId, session);
        return session;
    }
    async touchSession(sessionId) {
        await this.cleanupExpiredSessions();
        const pool = await this.getClient();
        await pool.query(`UPDATE user_sessions
       SET last_seen_at = NOW()
       WHERE session_id = $1
         AND revoked_at IS NULL
         AND expires_at > NOW()`, [sessionId]);
        // 캐시에서 세션 업데이트
        const cached = this.sessionCache.get(sessionId);
        if (cached && cached.data.isActive) {
            cached.data.lastSeenAt = new Date().toISOString();
        }
    }
    async deleteSession(sessionId) {
        await this.cleanupExpiredSessions();
        // 캐시에서 제거하여 다음 조회 시 최신 상태를 다시 읽도록 함
        this.clearCachedSession(sessionId);
        const pool = await this.getClient();
        const result = await pool.query(`UPDATE user_sessions
       SET revoked_at = NOW(),
           last_seen_at = NOW()
       WHERE session_id = $1
         AND revoked_at IS NULL`, [sessionId]);
        if ((result.rowCount ?? 0) > 0) {
            return true;
        }
        const exists = await pool.query(`SELECT 1 FROM user_sessions WHERE session_id = $1 LIMIT 1`, [sessionId]);
        return (exists.rowCount ?? 0) > 0;
    }
    async deleteUserSessions(userId) {
        await this.cleanupExpiredSessions();
        // 캐시에서 사용자의 모든 세션 제거
        this.clearUserSessions(userId);
        const pool = await this.getClient();
        const result = await pool.query(`DELETE FROM user_sessions WHERE user_id = $1`, [userId]);
        return result.rowCount ?? 0;
    }
};
exports.SessionService = SessionService;
exports.SessionService = SessionService = SessionService_1 = __decorate([
    (0, common_1.Injectable)()
], SessionService);
