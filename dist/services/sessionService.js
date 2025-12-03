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
var SessionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const pool_1 = require("../db/pool");
const supabaseService_1 = require("./supabaseService");
let SessionService = SessionService_1 = class SessionService {
    constructor(supabaseService) {
        this.supabaseService = supabaseService;
        this.logger = new common_1.Logger(SessionService_1.name);
        this.defaultTTLHours = 24 * 30;
        this.CLEANUP_INTERVAL_MS = process.env.NODE_ENV === 'production' ? 60 * 60 * 1000 : 45 * 60 * 1000; // Railway Sleep 친화적: 운영 1시간, 개발 45분
        this.lastCleanupRun = 0;
        // 세션 캐시: 10분 TTL, 최대 2000개 세션
        this.sessionCache = new Map();
        this.SESSION_CACHE_TTL = 15 * 60 * 1000; // 15분으로 확대해 캐시 적중률 향상
        this.MAX_CACHE_SIZE = 2000;
        // Supabase 세션 유효성 캐시: 5분 TTL
        this.supabaseValidityCache = new Map();
        this.SUPABASE_VALIDITY_TTL = 5 * 60 * 1000;
        this.indexesEnsured = false;
    }
    async getClient() {
        return (0, pool_1.getPool)();
    }
    async ensureIndexes() {
        if (this.indexesEnsured)
            return;
        const pool = await this.getClient();
        const statements = [
            `CREATE INDEX IF NOT EXISTS idx_user_sessions_session_id ON user_sessions (session_id)`,
            `CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions (user_id)`,
        ];
        for (const sql of statements) {
            try {
                await pool.query(sql);
            }
            catch (error) {
                this.logger.warn(`[ensureIndexes] Failed: ${sql} -> ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        this.indexesEnsured = true;
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
    getCachedSupabaseValidity(userId) {
        const cached = this.supabaseValidityCache.get(userId);
        if (!cached)
            return null;
        if (Date.now() > cached.expiresAt) {
            this.supabaseValidityCache.delete(userId);
            return null;
        }
        return cached.valid;
    }
    setCachedSupabaseValidity(userId, valid) {
        this.supabaseValidityCache.set(userId, {
            valid,
            expiresAt: Date.now() + this.SUPABASE_VALIDITY_TTL,
        });
        // 캐시 크기 제한
        if (this.supabaseValidityCache.size > 2000) {
            const firstKey = this.supabaseValidityCache.keys().next().value;
            if (firstKey)
                this.supabaseValidityCache.delete(firstKey);
        }
    }
    /**
     * Supabase 세션 유효성 확인 (빠른 검증)
     */
    async checkSupabaseSession(userId) {
        const cached = this.getCachedSupabaseValidity(userId);
        if (cached !== null)
            return cached;
        try {
            // Supabase에서 사용자 정보 조회로 세션 유효성 확인
            const user = await this.supabaseService.getUserById(userId);
            const valid = !!user;
            this.setCachedSupabaseValidity(userId, valid);
            return valid;
        }
        catch (error) {
            this.logger.warn(`Supabase session check failed for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            this.setCachedSupabaseValidity(userId, false);
            return false;
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
    scheduleCleanup(force = false) {
        this.cleanupExpiredSessions(force).catch((err) => this.logger.warn('Background session cleanup failed', err));
    }
    async createSession(userId, loginType) {
        const startTime = Date.now();
        // 기존 사용자 세션들을 캐시에서 제거 (빠른 메모리 작업)
        this.clearUserSessions(userId);
        // 만료 세션 정리는 백그라운드로 (첫 로그인 속도 향상)
        this.scheduleCleanup();
        await this.ensureIndexes();
        const pool = await this.getClient();
        const ttlHours = this.defaultTTLHours;
        const newSessionId = (0, crypto_1.randomUUID)();
        // 초고속 세션 생성: Upsert로 중복 없이 세션 갱신
        try {
            const result = await pool.query(`INSERT INTO user_sessions (session_id, user_id, login_type, expires_at, last_seen_at)
         VALUES ($4, $1, $2, NOW() + make_interval(hours => $3), NOW())
         ON CONFLICT (user_id)
         DO UPDATE
           SET session_id = EXCLUDED.session_id,
               login_type = EXCLUDED.login_type,
               expires_at = EXCLUDED.expires_at,
               last_seen_at = EXCLUDED.last_seen_at,
               revoked_at = NULL
         RETURNING session_id::text,
                   user_id::text,
                   login_type,
                   created_at::text,
                   last_seen_at::text,
                   expires_at::text,
                   revoked_at::text`, [userId, loginType, ttlHours, newSessionId]);
            const session = this.mapRowToSession(result.rows[0]);
            // 새 세션을 캐시에 저장
            this.setCachedSession(session.sessionId, session);
            const duration = Date.now() - startTime;
            this.logger.debug(`Ultra-fast session created in ${duration}ms for user ${userId}`);
            return session;
        }
        catch (error) {
            this.logger.error(`Fast session creation failed for user ${userId}`, error);
            throw error;
        }
    }
    async getSession(sessionId) {
        this.scheduleCleanup();
        // 캐시에서 먼저 확인
        const cachedSession = this.getCachedSession(sessionId);
        if (cachedSession) {
            if (cachedSession.isActive) {
                // Supabase 유효성 캐시를 우선 확인하여 바로 반환
                const cachedValidity = this.getCachedSupabaseValidity(cachedSession.userId);
                if (cachedValidity !== null) {
                    cachedSession.supabaseSessionValid = cachedValidity;
                    if (!cachedValidity) {
                        cachedSession.status = 'revoked';
                        cachedSession.isActive = false;
                    }
                }
                else {
                    // Supabase 체크는 백그라운드로 처리하여 응답을 빠르게
                    cachedSession.supabaseSessionValid = true;
                    this.refreshSupabaseValidity(sessionId, cachedSession.userId).catch((err) => this.logger.warn(`Background Supabase validity check failed for cache hit ${sessionId}`, err));
                }
            }
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
        // 세션이 활성 상태이면 Supabase 세션 상태도 확인 (비동기 우선)
        if (session.isActive) {
            const cachedValidity = this.getCachedSupabaseValidity(session.userId);
            if (cachedValidity !== null) {
                session.supabaseSessionValid = cachedValidity;
                if (!cachedValidity) {
                    session.status = 'revoked';
                    session.isActive = false;
                }
            }
            else {
                session.supabaseSessionValid = true; // 낙관적 반환으로 응답 시간 단축
                this.refreshSupabaseValidity(sessionId, session.userId).catch((err) => this.logger.warn(`Background Supabase validity check failed for session ${sessionId}`, err));
            }
        }
        // 캐시에 저장
        this.setCachedSession(sessionId, session);
        return session;
    }
    async touchSession(sessionId) {
        this.scheduleCleanup();
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
    async refreshSupabaseValidity(sessionId, userId) {
        const supabaseValid = await this.checkSupabaseSession(userId);
        this.setCachedSupabaseValidity(userId, supabaseValid);
        if (!supabaseValid) {
            const pool = await this.getClient();
            // 로컬 캐시 업데이트
            const cached = this.sessionCache.get(sessionId);
            if (cached) {
                cached.data.status = 'revoked';
                cached.data.isActive = false;
                cached.data.supabaseSessionValid = false;
            }
            // DB에서도 상태 업데이트 (백그라운드)
            pool.query(`UPDATE user_sessions SET revoked_at = NOW() WHERE session_id = $1`, [sessionId]).catch(err => this.logger.warn(`Failed to update revoked session in DB: ${err.message}`));
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
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [supabaseService_1.SupabaseService])
], SessionService);
