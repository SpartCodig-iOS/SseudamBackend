"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var TravelService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TravelService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const pool_1 = require("../../db/pool");
let TravelService = TravelService_1 = class TravelService {
    constructor() {
        this.logger = new common_1.Logger(TravelService_1.name);
    }
    async ensureOwner(travelId, userId, runner) {
        const executor = runner ?? (await (0, pool_1.getPool)());
        const result = await executor.query(`SELECT owner_id FROM travels WHERE id = $1`, [travelId]);
        const row = result.rows[0];
        if (!row) {
            throw new common_1.NotFoundException('여행을 찾을 수 없습니다.');
        }
        if (row.owner_id !== userId) {
            throw new common_1.ForbiddenException('여행 호스트만 수행할 수 있는 작업입니다.');
        }
    }
    async isMember(travelId, userId, runner) {
        const executor = runner ?? (await (0, pool_1.getPool)());
        const result = await executor.query(`SELECT 1 FROM travel_members WHERE travel_id = $1 AND user_id = $2 LIMIT 1`, [travelId, userId]);
        return Boolean(result.rows[0]);
    }
    async fetchSummaryForMember(travelId, userId) {
        const pool = await (0, pool_1.getPool)();
        const result = await pool.query(`SELECT
         t.id::text AS id,
         t.title,
         t.start_date::text,
         t.end_date::text,
         t.country_code,
         t.base_currency,
         t.base_exchange_rate,
         t.invite_code,
         t.status,
         t.created_at::text,
         tm.role,
         owner_profile.name AS owner_name,
         COALESCE(members.members, '[]'::json) AS members
       FROM travels t
       INNER JOIN travel_members tm ON tm.travel_id = t.id AND tm.user_id = $2
       LEFT JOIN profiles owner_profile ON owner_profile.id = t.owner_id
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
         WHERE tm2.travel_id = t.id
       ) AS members ON TRUE
       WHERE t.id = $1
       LIMIT 1`, [travelId, userId]);
        const row = result.rows[0];
        if (!row) {
            throw new common_1.NotFoundException('여행을 찾을 수 없거나 접근 권한이 없습니다.');
        }
        return this.mapSummary(row);
    }
    mapSummary(row) {
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
    async ensureTransaction(callback) {
        const pool = await (0, pool_1.getPool)();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            this.logger.error('Transaction failed', error);
            throw error;
        }
        finally {
            client.release();
        }
    }
    async createTravel(currentUser, payload) {
        try {
            return await this.ensureTransaction(async (client) => {
                const startTime = Date.now();
                const ownerName = currentUser.name ?? currentUser.email ?? '알 수 없는 사용자';
                const insertResult = await client.query(`WITH new_travel AS (
             INSERT INTO travels (owner_id, title, start_date, end_date, country_code, base_currency, base_exchange_rate, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
             RETURNING id,
                       title,
                       start_date,
                       end_date,
                       country_code,
                       base_currency,
                       base_exchange_rate,
                       NULL::text AS invite_code,
                       status,
                       created_at
           ),
           owner_member AS (
             INSERT INTO travel_members (travel_id, user_id, role)
             SELECT new_travel.id, $1, 'owner'
             FROM new_travel
             ON CONFLICT (travel_id, user_id) DO UPDATE
             SET role = EXCLUDED.role
             RETURNING travel_id
           )
           SELECT new_travel.id::text AS id,
                  new_travel.title,
                  new_travel.start_date::text,
                  new_travel.end_date::text,
                  new_travel.country_code,
                  new_travel.base_currency,
                  new_travel.base_exchange_rate,
                  new_travel.invite_code,
                  new_travel.status,
                  new_travel.created_at::text
           FROM new_travel`, [
                    currentUser.id,
                    payload.title,
                    payload.startDate,
                    payload.endDate,
                    payload.countryCode,
                    payload.baseCurrency,
                    payload.baseExchangeRate,
                ]);
                const travelRow = insertResult.rows[0];
                const optimizedResult = {
                    ...travelRow,
                    role: 'owner',
                    owner_name: ownerName,
                    members: [
                        {
                            userId: currentUser.id,
                            name: ownerName,
                            role: 'owner'
                        }
                    ]
                };
                const duration = Date.now() - startTime;
                this.logger.debug(`Travel created in ${duration}ms for user ${currentUser.id}`);
                return this.mapSummary(optimizedResult);
            });
        }
        catch (error) {
            this.logger.error('Failed to create travel', error);
            throw new common_1.InternalServerErrorException('여행 생성에 실패했습니다.');
        }
    }
    async listTravels(userId, pagination = {}) {
        const pool = await (0, pool_1.getPool)();
        const page = Math.max(1, pagination.page ?? 1);
        const limit = Math.min(100, Math.max(1, pagination.limit ?? 20));
        const offset = (page - 1) * limit;
        const totalPromise = pool.query(`SELECT COUNT(*)::int AS total
       FROM travel_members tm
       WHERE tm.user_id = $1`, [userId]);
        const listPromise = pool.query(`SELECT
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
       ORDER BY ut.created_at DESC
       LIMIT $2 OFFSET $3`, [userId, limit, offset]);
        const [totalResult, listResult] = await Promise.all([totalPromise, listPromise]);
        const total = totalResult.rows[0]?.total ?? 0;
        return {
            total,
            page,
            limit,
            items: listResult.rows.map((row) => this.mapSummary(row)),
        };
    }
    generateInviteCode() {
        return (0, crypto_1.randomBytes)(5).toString('hex');
    }
    async createInvite(travelId, userId) {
        const pool = await (0, pool_1.getPool)();
        await this.ensureOwner(travelId, userId, pool);
        const inviteCode = this.generateInviteCode();
        await this.ensureTransaction(async (client) => {
            await client.query(`INSERT INTO travel_invites (travel_id, invite_code, created_by, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT (invite_code)
         DO UPDATE SET status = 'active', used_count = 0`, [travelId, inviteCode, userId]);
            await client.query(`UPDATE travels SET invite_code = $2 WHERE id = $1`, [travelId, inviteCode]);
        });
        return { inviteCode };
    }
    async deleteTravel(travelId, userId) {
        const pool = await (0, pool_1.getPool)();
        await this.ensureOwner(travelId, userId, pool);
        await this.ensureTransaction(async (client) => {
            await client.query(`DELETE FROM travel_expense_participants
         WHERE expense_id IN (
           SELECT id FROM travel_expenses WHERE travel_id = $1
         )`, [travelId]);
            await client.query(`DELETE FROM travel_expenses WHERE travel_id = $1`, [travelId]);
            await client.query(`DELETE FROM travel_settlements WHERE travel_id = $1`, [travelId]);
            await client.query(`DELETE FROM travel_invites WHERE travel_id = $1`, [travelId]);
            await client.query(`DELETE FROM travel_members WHERE travel_id = $1`, [travelId]);
            await client.query(`DELETE FROM travels WHERE id = $1`, [travelId]);
        });
    }
    async joinByInviteCode(userId, inviteCode) {
        const pool = await (0, pool_1.getPool)();
        const inviteResult = await pool.query(`SELECT ti.travel_id,
              ti.status,
              ti.used_count,
              ti.max_uses,
              ti.expires_at,
              t.status AS travel_status
       FROM travel_invites ti
       INNER JOIN travels t ON t.id = ti.travel_id
       WHERE ti.invite_code = $1
       ORDER BY ti.created_at DESC
       LIMIT 1`, [inviteCode]);
        const inviteRow = inviteResult.rows[0];
        if (!inviteRow) {
            throw new common_1.NotFoundException('유효하지 않은 초대 코드입니다.');
        }
        if (inviteRow.status !== 'active' || inviteRow.travel_status !== 'active') {
            throw new common_1.BadRequestException('만료되었거나 비활성화된 초대 코드입니다.');
        }
        if (inviteRow.expires_at && new Date(inviteRow.expires_at) < new Date()) {
            throw new common_1.BadRequestException('만료된 초대 코드입니다.');
        }
        if (inviteRow.max_uses && inviteRow.used_count >= inviteRow.max_uses) {
            throw new common_1.BadRequestException('모집 인원을 초과한 초대 코드입니다.');
        }
        if (await this.isMember(inviteRow.travel_id, userId, pool)) {
            throw new common_1.BadRequestException('이미 참여 중인 여행입니다.');
        }
        await this.ensureTransaction(async (client) => {
            await client.query(`INSERT INTO travel_members (travel_id, user_id, role)
         VALUES ($1, $2, 'member')
         ON CONFLICT (travel_id, user_id) DO NOTHING`, [inviteRow.travel_id, userId]);
            await client.query(`UPDATE travel_invites
         SET used_count = used_count + 1
         WHERE invite_code = $1`, [inviteCode]);
        });
        return this.fetchSummaryForMember(inviteRow.travel_id, userId);
    }
    async updateTravel(travelId, userId, payload) {
        const pool = await (0, pool_1.getPool)();
        const result = await pool.query(`UPDATE travels
       SET title = $3,
           start_date = $4,
           end_date = $5,
           country_code = $6,
           base_currency = $7,
           base_exchange_rate = $8,
           updated_at = NOW()
       WHERE id = $1 AND owner_id = $2
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
         created_at::text`, [
            travelId,
            userId,
            payload.title,
            payload.startDate,
            payload.endDate,
            payload.countryCode,
            payload.baseCurrency,
            payload.baseExchangeRate,
        ]);
        const travelRow = result.rows[0];
        if (!travelRow) {
            const exists = await pool.query(`SELECT 1 FROM travels WHERE id = $1 LIMIT 1`, [travelId]);
            if (!exists.rows[0]) {
                throw new common_1.NotFoundException('여행을 찾을 수 없습니다.');
            }
            throw new common_1.ForbiddenException('여행 수정 권한이 없습니다.');
        }
        return this.fetchSummaryForMember(travelId, userId);
    }
    async removeMember(travelId, ownerId, memberId) {
        const pool = await (0, pool_1.getPool)();
        await this.ensureOwner(travelId, ownerId, pool);
        if (ownerId === memberId) {
            throw new common_1.BadRequestException('호스트는 스스로를 삭제할 수 없습니다.');
        }
        await pool.query(`DELETE FROM travel_members WHERE travel_id = $1 AND user_id = $2`, [travelId, memberId]);
    }
};
exports.TravelService = TravelService;
exports.TravelService = TravelService = TravelService_1 = __decorate([
    (0, common_1.Injectable)()
], TravelService);
