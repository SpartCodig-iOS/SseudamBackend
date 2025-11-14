import { Injectable, Logger } from '@nestjs/common';
import { getPool } from '../db/pool';
import { LoginType } from '../types/auth';

export interface SessionRecord {
  sessionId: string;
  userId: string;
  loginType: LoginType;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly defaultTTLHours = 24 * 30;

  // 세션 캐시: 10분 TTL, 최대 2000개 세션
  private readonly sessionCache = new Map<string, { data: SessionRecord; expiresAt: number }>();
  private readonly SESSION_CACHE_TTL = 10 * 60 * 1000; // 10분
  private readonly MAX_CACHE_SIZE = 2000;

  private async getClient() {
    return getPool();
  }

  // 세션 캐시 관리
  private getCachedSession(sessionId: string): SessionRecord | null {
    const cached = this.sessionCache.get(sessionId);
    if (!cached) return null;

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

  private setCachedSession(sessionId: string, session: SessionRecord): void {
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

  private clearCachedSession(sessionId: string): void {
    this.sessionCache.delete(sessionId);
  }

  private clearUserSessions(userId: string): void {
    // 특정 사용자의 모든 세션을 캐시에서 제거
    for (const [sessionId, cached] of this.sessionCache.entries()) {
      if (cached.data.userId === userId) {
        this.sessionCache.delete(sessionId);
      }
    }
  }

  async createSession(userId: string, loginType: LoginType): Promise<SessionRecord> {
    const startTime = Date.now();

    // 기존 사용자 세션들을 캐시에서 제거
    this.clearUserSessions(userId);

    const pool = await this.getClient();
    const result = await pool.query(
      `INSERT INTO user_sessions (user_id, login_type, expires_at, last_seen_at)
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
                 expires_at::text`,
      [userId, loginType],
    );

    const row = result.rows[0];
    const session: SessionRecord = {
      sessionId: row.session_id,
      userId: row.user_id,
      loginType: row.login_type,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at,
    };

    // 새 세션을 캐시에 저장
    this.setCachedSession(session.sessionId, session);

    const duration = Date.now() - startTime;
    this.logger.debug(`Session created in ${duration}ms for user ${userId}`);

    return session;
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    // 캐시에서 먼저 확인
    const cachedSession = this.getCachedSession(sessionId);
    if (cachedSession) {
      return cachedSession;
    }

    const pool = await this.getClient();
    const result = await pool.query(
      `SELECT session_id::text AS session_id,
              user_id::text AS user_id,
              login_type,
              created_at::text,
              last_seen_at::text,
              expires_at::text
       FROM user_sessions
       WHERE session_id = $1
         AND expires_at > NOW()
       LIMIT 1`,
      [sessionId],
    );

    const row = result.rows[0];
    if (!row) return null;

    const session: SessionRecord = {
      sessionId: row.session_id,
      userId: row.user_id,
      loginType: row.login_type,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at,
    };

    // 캐시에 저장
    this.setCachedSession(sessionId, session);

    return session;
  }

  async touchSession(sessionId: string): Promise<void> {
    const pool = await this.getClient();
    await pool.query(
      `UPDATE user_sessions
       SET last_seen_at = NOW()
       WHERE session_id = $1`,
      [sessionId],
    );

    // 캐시에서 세션 업데이트
    const cached = this.sessionCache.get(sessionId);
    if (cached) {
      cached.data.lastSeenAt = new Date().toISOString();
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    // 캐시에서 제거
    this.clearCachedSession(sessionId);

    const pool = await this.getClient();
    const result = await pool.query(
      `DELETE FROM user_sessions WHERE session_id = $1`,
      [sessionId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async deleteUserSessions(userId: string): Promise<number> {
    // 캐시에서 사용자의 모든 세션 제거
    this.clearUserSessions(userId);

    const pool = await this.getClient();
    const result = await pool.query(
      `DELETE FROM user_sessions WHERE user_id = $1`,
      [userId],
    );
    return result.rowCount ?? 0;
  }
}
