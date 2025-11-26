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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TravelExpenseService = void 0;
const common_1 = require("@nestjs/common");
const pool_1 = require("../../db/pool");
const meta_service_1 = require("../meta/meta.service");
let TravelExpenseService = class TravelExpenseService {
    constructor(metaService) {
        this.metaService = metaService;
    }
    async getTravelContext(travelId, userId) {
        const pool = await (0, pool_1.getPool)();
        const result = await pool.query(`SELECT
         t.id::text,
         t.base_currency,
         json_agg(
           json_build_object(
             'id', tm.user_id::text,
             'name', p.name
           )
         ) AS member_data
       FROM travels t
       INNER JOIN travel_members tm ON tm.travel_id = t.id
       LEFT JOIN profiles p ON p.id = tm.user_id
       WHERE t.id = $1
       GROUP BY t.id`, [travelId]);
        const row = result.rows[0];
        if (!row) {
            throw new common_1.NotFoundException('여행을 찾을 수 없습니다.');
        }
        const rawMembers = row.member_data ?? [];
        const memberIds = rawMembers.map((member) => member.id);
        if (!memberIds.includes(userId)) {
            throw new common_1.BadRequestException('해당 여행에 접근 권한이 없습니다.');
        }
        const memberNameMap = new Map();
        rawMembers.forEach((member) => {
            memberNameMap.set(member.id, member.name ?? null);
        });
        return {
            id: row.id,
            baseCurrency: row.base_currency,
            memberIds,
            memberNameMap,
        };
    }
    async convertAmount(amount, currency, targetCurrency) {
        if (currency === targetCurrency) {
            return amount;
        }
        const conversion = await this.metaService.getExchangeRate(currency, targetCurrency, amount);
        return Number(conversion.quoteAmount);
    }
    normalizeParticipants(memberIds, provided) {
        if (!provided || provided.length === 0) {
            return memberIds;
        }
        const invalid = provided.filter((id) => !memberIds.includes(id));
        if (invalid.length > 0) {
            throw new common_1.BadRequestException('참여자 목록에 여행 멤버가 아닌 사용자가 포함되어 있습니다.');
        }
        return provided;
    }
    ensurePayer(memberIds, payerId) {
        if (!memberIds.includes(payerId)) {
            throw new common_1.BadRequestException('결제자는 여행 멤버여야 합니다.');
        }
    }
    getMemberName(context, memberId) {
        return context.memberNameMap.get(memberId) ?? null;
    }
    async createExpense(travelId, userId, payload) {
        // 컨텍스트 조회와 환율 변환을 병렬로 처리하기 위해 먼저 컨텍스트만 조회
        const context = await this.getTravelContext(travelId, userId);
        const payerId = payload.payerId ?? userId;
        this.ensurePayer(context.memberIds, payerId);
        const participantIds = this.normalizeParticipants(context.memberIds, payload.participantIds);
        if (participantIds.length === 0) {
            throw new common_1.BadRequestException('최소 한 명 이상의 참여자가 필요합니다.');
        }
        // 환율 변환은 독립적으로 실행 가능하므로 병렬 처리 대상
        const convertedAmount = await this.convertAmount(payload.amount, payload.currency, context.baseCurrency);
        const splitAmount = Number((convertedAmount / participantIds.length).toFixed(2));
        const pool = await (0, pool_1.getPool)();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const expenseResult = await client.query(`INSERT INTO travel_expenses
           (travel_id, title, note, amount, currency, converted_amount, expense_date, category, payer_id, author_id)
         VALUES
           ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING
           id::text,
           title,
           note,
           amount,
           currency,
           converted_amount,
           expense_date::text,
           category,
           payer_id::text,
           author_id::text`, [
                travelId,
                payload.title,
                payload.note ?? null,
                payload.amount,
                payload.currency.toUpperCase(),
                convertedAmount,
                payload.expenseDate,
                payload.category ?? null,
                payerId,
                userId,
            ]);
            const expense = expenseResult.rows[0];
            // 배치 INSERT로 성능 최적화
            if (participantIds.length > 0) {
                await client.query(`INSERT INTO travel_expense_participants (expense_id, member_id, split_amount)
           SELECT $1, unnest($2::uuid[]), $3`, [expense.id, participantIds, splitAmount]);
            }
            await client.query('COMMIT');
            const payerName = this.getMemberName(context, payerId);
            const participants = participantIds.map((memberId) => ({
                memberId,
                name: this.getMemberName(context, memberId),
            }));
            return {
                id: expense.id,
                title: expense.title,
                note: expense.note,
                amount: Number(expense.amount),
                currency: expense.currency,
                convertedAmount: Number(expense.converted_amount),
                expenseDate: expense.expense_date,
                category: expense.category,
                authorId: expense.author_id,
                payerId: expense.payer_id,
                payerName,
                participants,
            };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async listExpenses(travelId, userId, pagination = {}) {
        await this.getTravelContext(travelId, userId);
        const pool = await (0, pool_1.getPool)();
        const page = Math.max(1, pagination.page ?? 1);
        const limit = Math.min(100, Math.max(1, pagination.limit ?? 20));
        const offset = (page - 1) * limit;
        const totalPromise = pool.query(`SELECT COUNT(*)::int AS total
       FROM travel_expenses
       WHERE travel_id = $1`, [travelId]);
        const listPromise = pool.query(`SELECT
         e.id::text,
         e.title,
         e.note,
         e.amount,
         e.currency,
         e.converted_amount,
         e.expense_date::text,
         e.category,
         e.author_id::text,
         e.payer_id::text,
         payer.name AS payer_name,
        COALESCE(participants.participants, '[]'::json) AS participants
       FROM travel_expenses e
       LEFT JOIN profiles payer ON payer.id = e.payer_id
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object(
           'memberId', tep.member_id,
           'name', p.name
         )) AS participants
         FROM travel_expense_participants tep
         LEFT JOIN profiles p ON p.id = tep.member_id
         WHERE tep.expense_id = e.id
       ) participants ON TRUE
       WHERE e.travel_id = $1
       ORDER BY e.expense_date DESC, e.created_at DESC
       LIMIT $2 OFFSET $3`, [travelId, limit, offset]);
        const [totalResult, listResult] = await Promise.all([totalPromise, listPromise]);
        const total = totalResult.rows[0]?.total ?? 0;
        return {
            total,
            page,
            limit,
            items: listResult.rows.map((row) => ({
                id: row.id,
                title: row.title,
                note: row.note,
                amount: Number(row.amount),
                currency: row.currency,
                convertedAmount: Number(row.converted_amount),
                expenseDate: row.expense_date,
                category: row.category,
                payerId: row.payer_id,
                payerName: row.payer_name ?? null,
                authorId: row.author_id,
                participants: row.participants?.map((participant) => ({
                    memberId: participant.memberId,
                    name: participant.name ?? null,
                })) ?? [],
            })),
        };
    }
    /**
     * 지출을 삭제합니다.
     * 권한: 지출 작성자만 삭제 가능
     */
    async deleteExpense(travelId, expenseId, userId) {
        const pool = await (0, pool_1.getPool)();
        // 1. 사용자가 여행 멤버인지 확인
        const context = await this.getTravelContext(travelId, userId);
        // 2. 지출 정보 조회 및 권한 확인
        const expenseResult = await pool.query(`SELECT
         e.id::text,
         e.travel_id::text,
         e.payer_id::text,
         e.author_id::text
       FROM travel_expenses e
       WHERE e.id = $1 AND e.travel_id = $2`, [expenseId, travelId]);
        const expense = expenseResult.rows[0];
        if (!expense) {
            throw new common_1.NotFoundException('지출을 찾을 수 없습니다.');
        }
        // 3. 권한 확인: 지출 작성자만 삭제 가능
        if (expense.author_id !== userId) {
            throw new common_1.ForbiddenException('지출 작성자만 삭제할 수 있습니다.');
        }
        // 4. 트랜잭션으로 지출 및 관련 데이터 삭제
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // 참여자 정보 먼저 삭제 (외래키 제약)
            await client.query(`DELETE FROM travel_expense_participants WHERE expense_id = $1`, [expenseId]);
            // 지출 정보 삭제
            const deleteResult = await client.query(`DELETE FROM travel_expenses WHERE id = $1 AND travel_id = $2`, [expenseId, travelId]);
            if (deleteResult.rowCount === 0) {
                throw new common_1.NotFoundException('삭제할 지출을 찾을 수 없습니다.');
            }
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
};
exports.TravelExpenseService = TravelExpenseService;
exports.TravelExpenseService = TravelExpenseService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [meta_service_1.MetaService])
], TravelExpenseService);
