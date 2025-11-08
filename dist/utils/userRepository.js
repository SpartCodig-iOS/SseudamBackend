"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUser = exports.createUser = exports.findById = exports.findByUsername = exports.findByEmail = exports.countUsers = void 0;
const pool_1 = require("../db/pool");
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
const mapRow = (row) => ({
    id: row.id,
    email: row.email,
    password_hash: row.password_hash,
    name: row.name,
    avatar_url: row.avatar_url,
    username: row.username,
    created_at: row.created_at,
    updated_at: row.updated_at,
});
const countUsers = async () => {
    const pool = await (0, pool_1.getPool)();
    const result = await pool.query('SELECT COUNT(*)::int AS total FROM users');
    return result.rows[0]?.total ?? 0;
};
exports.countUsers = countUsers;
const findByEmail = async (email) => {
    const pool = await (0, pool_1.getPool)();
    const result = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE lower(email) = lower($1) LIMIT 1`, [email]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
};
exports.findByEmail = findByEmail;
const findByUsername = async (username) => {
    const pool = await (0, pool_1.getPool)();
    const result = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE lower(username) = lower($1) LIMIT 1`, [username]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
};
exports.findByUsername = findByUsername;
const findById = async (id) => {
    const pool = await (0, pool_1.getPool)();
    const result = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1 LIMIT 1`, [id]);
    return result.rows[0] ? mapRow(result.rows[0]) : null;
};
exports.findById = findById;
const createUser = async (params) => {
    const pool = await (0, pool_1.getPool)();
    const result = await pool.query(`INSERT INTO users (email, password_hash, name, avatar_url, username)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${USER_COLUMNS}`, [params.email, params.passwordHash, params.name ?? null, params.avatarURL ?? null, params.username]);
    return mapRow(result.rows[0]);
};
exports.createUser = createUser;
const deleteUser = async (id) => {
    const pool = await (0, pool_1.getPool)();
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
};
exports.deleteUser = deleteUser;
