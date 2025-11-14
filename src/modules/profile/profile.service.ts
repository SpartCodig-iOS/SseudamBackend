import { Injectable, BadRequestException } from '@nestjs/common';
import { getPool } from '../../db/pool';
import { UpdateProfileInput } from '../../validators/profileSchemas';
import { UserRecord } from '../../types/user';
import { createClient } from '@supabase/supabase-js';
import { env } from '../../config/env';
import { randomUUID } from 'crypto';
import { Express } from 'express';
import 'multer';

@Injectable()
export class ProfileService {
  private readonly storageClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
  private readonly avatarBucket = 'profileimages';

  async getProfile(userId: string): Promise<UserRecord | null> {
    const pool = await getPool();
    const result = await pool.query(
      `SELECT
         id::text,
         email,
         name,
         avatar_url,
         username,
         created_at,
         updated_at
       FROM profiles
       WHERE id = $1
       LIMIT 1`,
      [userId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      avatar_url: row.avatar_url,
      username: row.username,
      created_at: row.created_at,
      updated_at: row.updated_at,
      password_hash: '',
    };
  }

  async updateProfile(
    userId: string,
    payload: UpdateProfileInput,
    file?: Express.Multer.File,
  ): Promise<UserRecord> {
    let avatarURL = payload.avatarURL ?? null;
    if (file) {
      avatarURL = await this.uploadToSupabase(userId, file);
    }

    const pool = await getPool();
    const result = await pool.query(
      `UPDATE profiles
       SET
         name = COALESCE($2, name),
         avatar_url = COALESCE($3, avatar_url),
         updated_at = NOW()
       WHERE id = $1
       RETURNING
         id::text,
         email,
         name,
         avatar_url,
         username,
         created_at,
         updated_at`,
      [userId, payload.name ?? null, avatarURL],
    );
    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      avatar_url: row.avatar_url,
      username: row.username,
      created_at: row.created_at,
      updated_at: row.updated_at,
      password_hash: '',
    };
  }

  private async uploadToSupabase(userId: string, file: Express.Multer.File): Promise<string> {
    if (!file || !file.mimetype.startsWith('image/')) {
      throw new BadRequestException('유효한 이미지 파일을 업로드하세요.');
    }

    const filename = `${userId}/${randomUUID()}-${file.originalname}`;
    const bucket = this.avatarBucket;

    const { error } = await this.storageClient.storage
      .from(bucket)
      .upload(filename, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (error) {
      throw new BadRequestException(`이미지 업로드 실패: ${error.message}`);
    }

    const { data } = this.storageClient.storage.from(bucket).getPublicUrl(filename);
    const publicUrl = data.publicUrl;

    return publicUrl;
  }
}
