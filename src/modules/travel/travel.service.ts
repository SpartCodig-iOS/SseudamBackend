import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PoolClient } from 'pg';
import { getPool } from '../../db/pool';
import { CreateTravelInput } from '../../validators/travelSchemas';

export interface TravelSummary {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  countryCode: string;
  baseCurrency: string;
  baseExchangeRate: number;
  inviteCode?: string;
  status: string;
  role: string;
  createdAt: string;
  ownerName: string | null;
  members?: TravelMember[];
}

export interface TravelDetail extends TravelSummary {}

export interface TravelInvitePayload {
  inviteCode: string;
}

export interface TravelMember {
  userId: string;
  name: string | null;
  role: string;
}

@Injectable()
export class TravelService {
  private readonly logger = new Logger(TravelService.name);

  private mapSummary(row: any): TravelSummary {
    return {
      id: row.id,
      title: row.title,
      startDate: row.start_date,
      endDate: row.end_date,
      countryCode: row.country_code,
      baseCurrency: row.base_currency,
      baseExchangeRate: Number(row.base_exchange_rate),
      inviteCode: row.invite_code ?? undefined,
      status: row.status,
      role: row.role,
      createdAt: row.created_at,
      ownerName: row.owner_name ?? null,
      members: row.members ?? undefined,
    };
  }

  private async ensureTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const pool = await getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Transaction failed', error as Error);
      throw error;
    } finally {
      client.release();
    }
  }

  async createTravel(userId: string, payload: CreateTravelInput): Promise<TravelDetail> {
    try {
      return await this.ensureTransaction(async (client) => {
        const insertResult = await client.query(
          `INSERT INTO travels (owner_id, title, start_date, end_date, country_code, base_currency, base_exchange_rate, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
           RETURNING id::text AS id,
                     title,
                     start_date::text,
                     end_date::text,
                     country_code,
                     base_currency,
                     base_exchange_rate,
                     NULL::text AS invite_code,
                     status,
                     created_at::text,
                     'owner'::text AS role,
                     (SELECT name FROM profiles WHERE id = $1) AS owner_name,
                     json_build_array(json_build_object(
                       'userId', $1,
                       'name', (SELECT name FROM profiles WHERE id = $1),
                       'role', 'owner'
                     )) AS members`,
          [
            userId,
            payload.title,
            payload.startDate,
            payload.endDate,
            payload.countryCode,
            payload.baseCurrency,
            payload.baseExchangeRate,
          ],
        );

        const travelRow = insertResult.rows[0];
        const travelId = travelRow.id;

        await client.query(
          `INSERT INTO travel_members (travel_id, user_id, role)
           VALUES ($1, $2, 'owner')
           ON CONFLICT (travel_id, user_id) DO NOTHING`,
          [travelId, userId],
        );

        return this.mapSummary(travelRow);
      });
    } catch (error) {
      this.logger.error('Failed to create travel', error as Error);
      throw new InternalServerErrorException('여행 생성에 실패했습니다.');
    }
  }

  async listTravels(userId: string): Promise<TravelSummary[]> {
    const pool = await getPool();
    const result = await pool.query(
      `SELECT
         ut.id::text AS id,
         ut.title,
         ut.start_date::text,
         ut.end_date::text,
         ut.country_code,
         ut.base_currency,
         ut.base_exchange_rate,
         ut.invite_code,
         ut.status,
         ut.role,
         ut.created_at::text,
         owner_profile.name AS owner_name,
         COALESCE(members.members, '[]'::json) AS members
       FROM (
         SELECT t.*, tm.role
         FROM travels t
         INNER JOIN travel_members tm ON tm.travel_id = t.id AND tm.user_id = $1
       ) AS ut
       INNER JOIN profiles owner_profile ON owner_profile.id = ut.owner_id
       LEFT JOIN LATERAL (
         SELECT json_agg(
                  json_build_object(
                    'userId', tm2.user_id,
                    'name', p.name,
                    'role', tm2.role
                  )
                  ORDER BY tm2.joined_at
                ) AS members
         FROM travel_members tm2
         LEFT JOIN profiles p ON p.id = tm2.user_id
         WHERE tm2.travel_id = ut.id
       ) AS members ON TRUE
       ORDER BY ut.created_at DESC`,
      [userId],
    );
    return result.rows.map((row) => this.mapSummary(row));
  }

  private async getMemberRole(travelId: string, userId: string): Promise<string | null> {
    const pool = await getPool();
    const result = await pool.query(
      `SELECT role FROM travel_members WHERE travel_id = $1 AND user_id = $2 LIMIT 1`,
      [travelId, userId],
    );
    return result.rows[0]?.role ?? null;
  }

  private generateInviteCode(): string {
    return randomBytes(5).toString('hex');
  }

  async createInvite(travelId: string, userId: string): Promise<TravelInvitePayload> {
    const role = await this.getMemberRole(travelId, userId);
    if (!role) {
      throw new ForbiddenException('해당 여행에 대한 권한이 없습니다.');
    }
    if (role !== 'owner') {
      throw new ForbiddenException('초대 코드는 호스트만 생성할 수 있습니다.');
    }

    const pool = await getPool();
    const travelResult = await pool.query(
      `SELECT id FROM travels WHERE id = $1 LIMIT 1`,
      [travelId],
    );
    if (!travelResult.rows[0]) {
      throw new NotFoundException('여행을 찾을 수 없습니다.');
    }

    const inviteCode = this.generateInviteCode();
    await this.ensureTransaction(async (client) => {
      await client.query(
        `INSERT INTO travel_invites (travel_id, invite_code, created_by, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT (invite_code)
         DO UPDATE SET status = 'active', used_count = 0`,
        [travelId, inviteCode, userId],
      );

      await client.query(
        `UPDATE travels SET invite_code = $2 WHERE id = $1`,
        [travelId, inviteCode],
      );
    });

    return { inviteCode };
  }

  async deleteTravel(travelId: string, userId: string): Promise<void> {
    const pool = await getPool();
    const travelResult = await pool.query(
      `SELECT owner_id FROM travels WHERE id = $1 LIMIT 1`,
      [travelId],
    );
    const travel = travelResult.rows[0];
    if (!travel) {
      throw new NotFoundException('여행을 찾을 수 없습니다.');
    }
    if (travel.owner_id !== userId) {
      throw new ForbiddenException('여행 삭제 권한이 없습니다.');
    }

    await this.ensureTransaction(async (client) => {
      await client.query(`DELETE FROM travel_invites WHERE travel_id = $1`, [travelId]);
      await client.query(`DELETE FROM travel_members WHERE travel_id = $1`, [travelId]);
      await client.query(`DELETE FROM travels WHERE id = $1`, [travelId]);
    });
  }

  async joinByInviteCode(userId: string, inviteCode: string): Promise<TravelSummary> {
    const pool = await getPool();
    const inviteResult = await pool.query(
      `SELECT ti.travel_id,
              ti.status,
              ti.used_count,
              ti.max_uses,
              ti.expires_at,
              t.title,
              t.start_date::text,
              t.end_date::text,
              t.country_code,
              t.base_currency,
              t.base_exchange_rate,
              t.invite_code,
              t.status AS travel_status,
              t.created_at::text,
              owner_profile.name AS owner_name,
              COALESCE(members.members, '[]'::json) AS members
       FROM travel_invites ti
       INNER JOIN travels t ON t.id = ti.travel_id
       INNER JOIN profiles owner_profile ON owner_profile.id = t.owner_id
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object(
           'userId', tm.user_id,
           'name', p.name,
           'role', tm.role
         )) AS members
         FROM travel_members tm
         LEFT JOIN profiles p ON p.id = tm.user_id
         WHERE tm.travel_id = t.id
       ) AS members ON TRUE
       WHERE ti.invite_code = $1
       ORDER BY ti.created_at DESC
       LIMIT 1`,
      [inviteCode],
    );

    const inviteRow = inviteResult.rows[0];
    if (!inviteRow) {
      throw new NotFoundException('유효하지 않은 초대 코드입니다.');
    }
    if (inviteRow.status !== 'active' || inviteRow.travel_status !== 'active') {
      throw new BadRequestException('만료되었거나 비활성화된 초대 코드입니다.');
    }
    if (inviteRow.expires_at && new Date(inviteRow.expires_at) < new Date()) {
      throw new BadRequestException('만료된 초대 코드입니다.');
    }
    if (inviteRow.max_uses && inviteRow.used_count >= inviteRow.max_uses) {
      throw new BadRequestException('모집 인원을 초과한 초대 코드입니다.');
    }

    const existingRole = await this.getMemberRole(inviteRow.travel_id, userId);
    if (existingRole) {
      throw new BadRequestException('이미 참여 중인 여행입니다.');
    }

    const members = await this.ensureTransaction(async (client) => {
      await client.query(
        `INSERT INTO travel_members (travel_id, user_id, role)
         VALUES ($1, $2, 'member')
         ON CONFLICT (travel_id, user_id) DO NOTHING`,
        [inviteRow.travel_id, userId],
      );

      const membersResult = await client.query(
        `SELECT json_agg(json_build_object(
            'userId', tm.user_id,
            'name', p.name,
            'role', tm.role
          )) AS members
         FROM travel_members tm
         LEFT JOIN profiles p ON p.id = tm.user_id
         WHERE tm.travel_id = $1`,
        [inviteRow.travel_id],
      );

      await client.query(
        `UPDATE travel_invites
         SET used_count = used_count + 1
         WHERE invite_code = $1`,
        [inviteCode],
      );

      return membersResult.rows[0]?.members ?? [];
    });

    return this.mapSummary({
      id: inviteRow.travel_id,
      title: inviteRow.title,
      start_date: inviteRow.start_date,
      end_date: inviteRow.end_date,
      country_code: inviteRow.country_code,
      base_currency: inviteRow.base_currency,
      base_exchange_rate: inviteRow.base_exchange_rate,
      invite_code: inviteRow.invite_code,
      status: inviteRow.travel_status,
      role: 'member',
      created_at: inviteRow.created_at,
      owner_name: inviteRow.owner_name,
      members,
    });
  }

  async updateTravel(
    travelId: string,
    userId: string,
    payload: CreateTravelInput,
  ): Promise<TravelSummary> {
    const ownerRole = await this.getMemberRole(travelId, userId);
    if (ownerRole !== 'owner') {
      throw new ForbiddenException('여행 수정 권한이 없습니다.');
    }

    const pool = await getPool();
    const result = await pool.query(
      `UPDATE travels
       SET title = $2,
           start_date = $3,
           end_date = $4,
           country_code = $5,
           base_currency = $6,
           base_exchange_rate = $7,
           updated_at = NOW()
       WHERE id = $1
       RETURNING
         id::text AS id,
         title,
         start_date::text,
         end_date::text,
         country_code,
         base_currency,
         base_exchange_rate,
         invite_code,
         status,
         created_at::text`,
      [
        travelId,
        payload.title,
        payload.startDate,
        payload.endDate,
        payload.countryCode,
        payload.baseCurrency,
        payload.baseExchangeRate,
      ],
    );
    const travelRow = result.rows[0];
    if (!travelRow) {
      throw new NotFoundException('여행을 찾을 수 없습니다.');
    }

    const ownerProfile = await pool.query(`SELECT name FROM profiles WHERE id = $1`, [userId]);

    return this.mapSummary({
      ...travelRow,
      role: 'owner',
      owner_name: ownerProfile.rows[0]?.name ?? null,
      members: undefined,
    });
  }

  async removeMember(travelId: string, ownerId: string, memberId: string): Promise<void> {
    const ownerRole = await this.getMemberRole(travelId, ownerId);
    if (ownerRole !== 'owner') {
      throw new ForbiddenException('호스트만 멤버를 삭제할 수 있습니다.');
    }
    if (ownerId === memberId) {
      throw new BadRequestException('호스트는 스스로를 삭제할 수 없습니다.');
    }

    const pool = await getPool();
    await pool.query(
      `DELETE FROM travel_members WHERE travel_id = $1 AND user_id = $2`,
      [travelId, memberId],
    );
  }
}
