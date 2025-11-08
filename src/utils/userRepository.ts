import { getPool } from '../db/pool';
import { UserRecord } from '../types/user';

const USER_COLUMNS = `
  id::text AS id,
  email,
  password_hash,
  name,
  avatar_url,
  username,
  created_at,
  updated_at
`;

const mapRow = (row: any): UserRecord => ({
  id: row.id,
  email: row.email,
  password_hash: row.password_hash,
  name: row.name,
  avatar_url: row.avatar_url,
  username: row.username,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export const countUsers = async (): Promise<number> => {
  const pool = await getPool();
  const result = await pool.query('SELECT COUNT(*)::int AS total FROM users');
  return result.rows[0]?.total ?? 0;
};

export const findByEmail = async (email: string): Promise<UserRecord | null> => {
  const pool = await getPool();
  const result = await pool.query(
    `SELECT ${USER_COLUMNS} FROM users WHERE lower(email) = lower($1) LIMIT 1`,
    [email],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
};

export const findByUsername = async (username: string): Promise<UserRecord | null> => {
  const pool = await getPool();
  const result = await pool.query(
    `SELECT ${USER_COLUMNS} FROM users WHERE lower(username) = lower($1) LIMIT 1`,
    [username],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
};

export const findById = async (id: string): Promise<UserRecord | null> => {
  const pool = await getPool();
  const result = await pool.query(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
};

export const createUser = async (params: {
  email: string;
  passwordHash: string;
  name?: string | null;
  avatarURL?: string | null;
  username: string;
}): Promise<UserRecord> => {
  const pool = await getPool();
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, name, avatar_url, username)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${USER_COLUMNS}`,
    [params.email, params.passwordHash, params.name ?? null, params.avatarURL ?? null, params.username],
  );
  return mapRow(result.rows[0]);
};

export const deleteUser = async (id: string): Promise<void> => {
  const pool = await getPool();
  await pool.query('DELETE FROM users WHERE id = $1', [id]);
};
