import { Injectable } from '@nestjs/common';
import { getPool } from '../db/pool';

@Injectable()
export class OAuthTokenService {
  async saveToken(userId: string, provider: string, refreshToken: string | null): Promise<void> {
    const pool = await getPool();
    if (!refreshToken) {
      await pool.query(
        `DELETE FROM oauth_refresh_tokens WHERE user_id = $1 AND provider = $2`,
        [userId, provider],
      );
      return;
    }

    await pool.query(
      `INSERT INTO oauth_refresh_tokens (user_id, provider, refresh_token, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, provider)
       DO UPDATE SET refresh_token = EXCLUDED.refresh_token,
                     updated_at = NOW()`,
      [userId, provider, refreshToken],
    );
  }

  async getToken(userId: string, provider: string): Promise<string | null> {
    const pool = await getPool();
    const result = await pool.query(
      `SELECT refresh_token FROM oauth_refresh_tokens
       WHERE user_id = $1 AND provider = $2
       LIMIT 1`,
      [userId, provider],
    );
    return (result.rows[0]?.refresh_token as string | null) ?? null;
  }
}
