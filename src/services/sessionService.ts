import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { getPool } from '../db/pool';
import { LoginType } from '../types/auth';
import { SupabaseService } from './supabaseService';

export type SessionStatus = 'active' | 'revoked' | 'expired';

export interface SessionRecord {
  sessionId: string;
  userId: string;
  loginType: LoginType;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  status: SessionStatus;
  isActive: boolean;
  supabaseSessionValid?: boolean; // Supabase 세션 유효성
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly defaultTTLHours = 24 * 30;
  private readonly CLEANUP_INTERVAL_MS = process.env.NODE_ENV === 'production' ? 60 * 60 * 1000 : 45 * 60 * 1000; // Railway Sleep 친화적: 운영 1시간, 개발 45분
  private lastCleanupRun = 0;

  constructor(private readonly supabaseService: SupabaseService) {}

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

  /**
   * Supabase 세션 유효성 확인 (빠른 검증)
   */
  private async checkSupabaseSession(userId: string): Promise<boolean> {
    try {
      // Supabase에서 사용자 정보 조회로 세션 유효성 확인
      const user = await this.supabaseService.getUser(userId);
      return !!user;
    } catch (error) {
      this.logger.warn(`Supabase session check failed for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  private mapRowToSession(row: any): SessionRecord {
    const createdAt = row.created_at;
    const lastSeenAt = row.last_seen_at;
    const expiresAt = row.expires_at;
    const revokedAt = row.revoked_at ?? null;

    const now = new Date();
    const expiresDate = new Date(expiresAt);
    const revokedDate = revokedAt ? new Date(revokedAt) : null;

    let status: SessionStatus = 'active';
    if (revokedDate) {
      status = 'revoked';
    } else if (expiresDate <= now) {
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

  private purgeExpiredCacheEntries(): void {
    const now = new Date();
    for (const [sessionId, cached] of this.sessionCache.entries()) {
      if (new Date(cached.data.expiresAt) <= now) {
        this.sessionCache.delete(sessionId);
      }
    }
  }

  private async cleanupExpiredSessions(force = false): Promise<void> {
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
    } catch (error) {
      this.logger.warn(`Failed to clean expired sessions: ${(error as Error).message}`);
    }
  }

  private scheduleCleanup(force = false): void {
    this.cleanupExpiredSessions(force).catch((err) =>
      this.logger.warn('Background session cleanup failed', err),
    );
  }

  async createSession(userId: string, loginType: LoginType): Promise<SessionRecord> {
    const startTime = Date.now();

    // 기존 사용자 세션들을 캐시에서 제거 (빠른 메모리 작업)
    this.clearUserSessions(userId);

    // 만료 세션 정리는 백그라운드로 (첫 로그인 속도 향상)
    this.scheduleCleanup();

    const pool = await this.getClient();
    const ttlHours = this.defaultTTLHours;

    const newSessionId = randomUUID();
    // 초고속 세션 생성: Upsert로 중복 없이 세션 갱신
    try {
      const result = await pool.query(
        `INSERT INTO user_sessions (session_id, user_id, login_type, expires_at, last_seen_at)
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
                   revoked_at::text`,
        [userId, loginType, ttlHours, newSessionId]
      );

      const session = this.mapRowToSession(result.rows[0]);

      // 새 세션을 캐시에 저장
      this.setCachedSession(session.sessionId, session);

      const duration = Date.now() - startTime;
      this.logger.debug(`Ultra-fast session created in ${duration}ms for user ${userId}`);

      return session;
    } catch (error) {
      this.logger.error(`Fast session creation failed for user ${userId}`, error);
      throw error;
    }
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    this.scheduleCleanup();

    // 캐시에서 먼저 확인
    const cachedSession = this.getCachedSession(sessionId);
    if (cachedSession) {
      // 캐시된 세션이 활성 상태이면 Supabase 세션도 확인
      if (cachedSession.isActive && cachedSession.supabaseSessionValid === undefined) {
        const supabaseValid = await this.checkSupabaseSession(cachedSession.userId);
        cachedSession.supabaseSessionValid = supabaseValid;

        // Supabase 세션이 무효하면 로컬 세션도 무효로 처리
        if (!supabaseValid) {
          cachedSession.status = 'revoked';
          cachedSession.isActive = false;
        }
      }
      return cachedSession;
    }

    const pool = await this.getClient();
    const result = await pool.query(
      `SELECT session_id::text AS session_id,
              user_id::text AS user_id,
              login_type,
              created_at::text,
              last_seen_at::text,
              expires_at::text,
              revoked_at::text
       FROM user_sessions
       WHERE session_id = $1
       LIMIT 1`,
      [sessionId],
    );

    const row = result.rows[0];
    if (!row) return null;

    const session = this.mapRowToSession(row);

    // 세션이 활성 상태이면 Supabase 세션 상태도 확인
    if (session.isActive) {
      const supabaseValid = await this.checkSupabaseSession(session.userId);
      session.supabaseSessionValid = supabaseValid;

      // Supabase 세션이 무효하면 로컬 세션도 무효로 처리하고 DB 업데이트
      if (!supabaseValid) {
        session.status = 'revoked';
        session.isActive = false;

        // 백그라운드에서 DB의 세션도 revoke 처리
        pool.query(
          `UPDATE user_sessions SET revoked_at = NOW() WHERE session_id = $1`,
          [sessionId]
        ).catch(err =>
          this.logger.warn(`Failed to update revoked session in DB: ${err.message}`)
        );
      }
    }

    // 캐시에 저장
    this.setCachedSession(sessionId, session);

    return session;
  }

  async touchSession(sessionId: string): Promise<void> {
    this.scheduleCleanup();

    const pool = await this.getClient();
    await pool.query(
      `UPDATE user_sessions
       SET last_seen_at = NOW()
       WHERE session_id = $1
         AND revoked_at IS NULL
         AND expires_at > NOW()`,
      [sessionId],
    );

    // 캐시에서 세션 업데이트
    const cached = this.sessionCache.get(sessionId);
    if (cached && cached.data.isActive) {
      cached.data.lastSeenAt = new Date().toISOString();
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    await this.cleanupExpiredSessions();

    // 캐시에서 제거하여 다음 조회 시 최신 상태를 다시 읽도록 함
    this.clearCachedSession(sessionId);

    const pool = await this.getClient();
    const result = await pool.query(
      `UPDATE user_sessions
       SET revoked_at = NOW(),
           last_seen_at = NOW()
       WHERE session_id = $1
         AND revoked_at IS NULL`,
      [sessionId],
    );
    if ((result.rowCount ?? 0) > 0) {
      return true;
    }

    const exists = await pool.query(
      `SELECT 1 FROM user_sessions WHERE session_id = $1 LIMIT 1`,
      [sessionId],
    );
    return (exists.rowCount ?? 0) > 0;
  }

  async deleteUserSessions(userId: string): Promise<number> {
    await this.cleanupExpiredSessions();

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
