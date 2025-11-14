import { Injectable } from '@nestjs/common';
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
  private readonly defaultTTLHours = 24 * 30;

  private async getClient() {
    return getPool();
  }

  async createSession(userId: string, loginType: LoginType): Promise<SessionRecord> {
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
    return {
      sessionId: row.session_id,
      userId: row.user_id,
      loginType: row.login_type,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at,
    };
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
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
    return {
      sessionId: row.session_id,
      userId: row.user_id,
      loginType: row.login_type,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at,
    };
  }

  async touchSession(sessionId: string): Promise<void> {
    const pool = await this.getClient();
    await pool.query(
      `UPDATE user_sessions
       SET last_seen_at = NOW()
       WHERE session_id = $1`,
      [sessionId],
    );
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const pool = await this.getClient();
    const result = await pool.query(
      `DELETE FROM user_sessions WHERE session_id = $1`,
      [sessionId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async deleteUserSessions(userId: string): Promise<number> {
    const pool = await this.getClient();
    const result = await pool.query(
      `DELETE FROM user_sessions WHERE user_id = $1`,
      [userId],
    );
    return result.rowCount ?? 0;
  }
}
