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
const event_emitter_1 = require("@nestjs/event-emitter");
const pool_1 = require("../../db/pool");
const meta_service_1 = require("../meta/meta.service");
const cacheService_1 = require("../../services/cacheService");
const push_notification_service_1 = require("../../services/push-notification.service");
let TravelExpenseService = class TravelExpenseService {
    constructor(metaService, cacheService, eventEmitter, pushNotificationService) {
        this.metaService = metaService;
        this.cacheService = cacheService;
        this.eventEmitter = eventEmitter;
        this.pushNotificationService = pushNotificationService;
        this.EXPENSE_LIST_PREFIX = 'expense:list';
        this.EXPENSE_DETAIL_PREFIX = 'expense:detail';
        this.EXPENSE_LIST_TTL_SECONDS = 120; // 2분
        this.EXPENSE_DETAIL_TTL_SECONDS = 120; // 2분
        this.CONTEXT_PREFIX = 'expense:context';
        this.CONTEXT_TTL_SECONDS = 600; // 10분
        this.contextCache = new Map();
        this.conversionCache = new Map(); // currency->KRW 환율 캐시 (요청 단위)
    }
    async getTravelContext(travelId, userId) {
        const cached = this.contextCache.get(travelId);
        if (cached && cached.expiresAt > Date.now()) {
            if (!cached.data.memberIds.includes(userId)) {
                throw new common_1.BadRequestException('해당 여행에 접근 권한이 없습니다.');
            }
            return cached.data;
        }
        try {
            const redisCached = await this.cacheService.get(travelId, { prefix: this.CONTEXT_PREFIX });
            if (redisCached) {
                this.contextCache.set(travelId, { data: redisCached, expiresAt: Date.now() + this.CONTEXT_TTL_SECONDS * 1000 });
                if (!redisCached.memberIds.includes(userId)) {
                    throw new common_1.BadRequestException('해당 여행에 접근 권한이 없습니다.');
                }
                return redisCached;
            }
        }
        catch {
            // ignore and fallback to DB
        }
        const pool = await (0, pool_1.getPool)();
        const result = await pool.query(`SELECT
         t.id::text,
         t.base_currency,
         t.base_exchange_rate,
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
        const context = {
            id: row.id,
            baseCurrency: row.base_currency || 'KRW',
            baseExchangeRate: Number(row.base_exchange_rate ?? 0),
            memberIds,
            memberNameMap,
        };
        this.contextCache.set(travelId, { data: context, expiresAt: Date.now() + this.CONTEXT_TTL_SECONDS * 1000 });
        this.cacheService.set(travelId, context, { prefix: this.CONTEXT_PREFIX, ttl: this.CONTEXT_TTL_SECONDS }).catch(() => undefined);
        return context;
    }
    async convertAmount(amount, currency, targetCurrency, fallbackRate) {
        if (currency === targetCurrency) {
            return amount;
        }
        // 요청 단위 환율 캐시 활용 (currency -> KRW)
        if (targetCurrency === 'KRW' && this.conversionCache.has(currency)) {
            const rate = this.conversionCache.get(currency);
            return Number((amount * rate).toFixed(2));
        }
        // baseExchangeRate가 있으면 API 호출 없이 바로 계산
        if (targetCurrency === 'KRW' && fallbackRate && currency !== targetCurrency) {
            return Number((amount * fallbackRate).toFixed(2));
        }
        try {
            const conversion = await this.metaService.getExchangeRate(currency, targetCurrency, amount);
            // KRW 대상이면 rate 캐시 저장 (amount에 따라 선형이라 단일 rate로 충분)
            if (targetCurrency === 'KRW' && amount !== 0) {
                const rate = Number(conversion.quoteAmount) / amount;
                if (Number.isFinite(rate)) {
                    this.conversionCache.set(currency, rate);
                }
            }
            return Number(conversion.quoteAmount);
        }
        catch (error) {
            if (fallbackRate && targetCurrency === 'KRW' && currency !== targetCurrency) {
                return Number((amount * fallbackRate).toFixed(2));
            }
            // 환율 API 실패 시 fallback: 동일 금액 반환 (추가 오류 방지)
            return amount;
        }
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
    async invalidateExpenseCaches(travelId, expenseId) {
        // 리스트 캐시 삭제
        await this.cacheService.delPattern(`${this.EXPENSE_LIST_PREFIX}:${travelId}:*`).catch(() => undefined);
        if (expenseId) {
            await this.cacheService.del(expenseId, { prefix: this.EXPENSE_DETAIL_PREFIX }).catch(() => undefined);
        }
        // 정산 요약 캐시도 무효화
        await this.cacheService.del(travelId, { prefix: 'settlement:summary' }).catch(() => undefined);
        // 컨텍스트 캐시도 함께 무효화 (멤버 변경 가능성)
        this.contextCache.delete(travelId);
        await this.cacheService.del(travelId, { prefix: this.CONTEXT_PREFIX }).catch(() => undefined);
    }
    async getCachedExpenseList(cacheKey) {
        try {
            return await this.cacheService.get(cacheKey, {
                prefix: this.EXPENSE_LIST_PREFIX,
            });
        }
        catch {
            return null;
        }
    }
    async setCachedExpenseList(cacheKey, payload) {
        this.cacheService.set(cacheKey, payload, {
            prefix: this.EXPENSE_LIST_PREFIX,
            ttl: this.EXPENSE_LIST_TTL_SECONDS,
        }).catch(() => undefined);
    }
    async getCachedExpenseDetail(expenseId) {
        try {
            return await this.cacheService.get(expenseId, { prefix: this.EXPENSE_DETAIL_PREFIX });
        }
        catch {
            return null;
        }
    }
    async setCachedExpenseDetail(expenseId, expense) {
        this.cacheService.set(expenseId, expense, {
            prefix: this.EXPENSE_DETAIL_PREFIX,
            ttl: this.EXPENSE_DETAIL_TTL_SECONDS,
        }).catch(() => undefined);
    }
    async invalidateExpenseListAndDetail(travelId, expenseId) {
        await this.invalidateExpenseCaches(travelId, expenseId);
    }
    async createExpense(travelId, userId, payload) {
        // 요청 단위 환율 캐시 초기화
        this.conversionCache.clear();
        // 컨텍스트 조회와 환율 변환을 병렬로 처리하기 위해 먼저 컨텍스트만 조회
        const context = await this.getTravelContext(travelId, userId);
        const payerId = payload.payerId ?? userId;
        this.ensurePayer(context.memberIds, payerId);
        const participantIds = this.normalizeParticipants(context.memberIds, payload.participantIds);
        if (participantIds.length === 0) {
            throw new common_1.BadRequestException('최소 한 명 이상의 참여자가 필요합니다.');
        }
        // 환율 변환은 독립적으로 실행 가능하므로 병렬 처리 대상
        const convertedAmount = await this.convertAmount(payload.amount, payload.currency, 'KRW', context.baseExchangeRate);
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
            const result = {
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
            // 생성 후 캐시 무효화 (동기)로 즉시 반영
            await this.invalidateExpenseCaches(travelId);
            // 지출 추가 알림 이벤트 발송
            const currentUserName = this.getMemberName(context, userId) || '사용자';
            await this.pushNotificationService.sendExpenseNotification('expense_added', travelId, userId, currentUserName, payload.title, context.memberIds, payload.amount, payload.currency);
            return result;
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
        const context = await this.getTravelContext(travelId, userId);
        const pool = await (0, pool_1.getPool)();
        const page = Math.max(1, pagination.page ?? 1);
        const limit = Math.min(100, Math.max(1, pagination.limit ?? 20));
        const offset = (page - 1) * limit;
        // 날짜 필터 파라미터 검증 및 준비
        const { startDate, endDate } = pagination;
        let dateFilter = '';
        const queryParams = [travelId, limit, offset];
        let paramIndex = 4;
        if (startDate || endDate) {
            const dateConditions = [];
            if (startDate) {
                dateConditions.push(`e.expense_date >= $${paramIndex}`);
                queryParams.push(startDate);
                paramIndex++;
            }
            if (endDate) {
                dateConditions.push(`e.expense_date <= $${paramIndex}`);
                queryParams.push(endDate);
                paramIndex++;
            }
            dateFilter = `AND ${dateConditions.join(' AND ')}`;
        }
        // 캐시 키에 날짜 필터 포함
        const cacheKey = `${travelId}:${page}:${limit}:${startDate || ''}:${endDate || ''}`;
        const cached = await this.getCachedExpenseList(cacheKey);
        if (cached) {
            return { total: cached.total, page, limit, items: cached.items };
        }
        // 최적화: 모든 데이터를 한 번에 조회 (JOIN + JSON 집계)
        const combinedResult = await pool.query(`WITH expense_list AS (
         SELECT
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
           COUNT(*) OVER() AS total_count,
           ROW_NUMBER() OVER (ORDER BY e.expense_date DESC, e.created_at DESC) as row_num
         FROM travel_expenses e
         LEFT JOIN profiles payer ON payer.id = e.payer_id
         WHERE e.travel_id = $1 ${dateFilter}
       ),
       paginated_expenses AS (
         SELECT * FROM expense_list
         WHERE row_num > $3 AND row_num <= $3 + $2
       )
       SELECT
         pe.*,
         COALESCE(
           json_agg(
             json_build_object(
               'memberId', tep.member_id::text,
               'name', p.name
             )
             ORDER BY p.name
           ) FILTER (WHERE tep.member_id IS NOT NULL),
           '[]'::json
         ) as participants
       FROM paginated_expenses pe
       LEFT JOIN travel_expense_participants tep ON tep.expense_id = pe.id::uuid
       LEFT JOIN profiles p ON p.id = tep.member_id
       GROUP BY pe.id, pe.title, pe.note, pe.amount, pe.currency, pe.converted_amount,
                pe.expense_date, pe.category, pe.author_id, pe.payer_id, pe.payer_name,
                pe.total_count, pe.row_num
       ORDER BY pe.row_num`, queryParams);
        const total = Number(combinedResult.rows[0]?.total_count ?? 0);
        const items = await Promise.all(combinedResult.rows.map(async (row) => {
            const amount = Number(row.amount);
            const convertedAmount = await this.convertAmount(amount, row.currency, 'KRW', context.baseExchangeRate);
            return {
                id: row.id,
                title: row.title,
                note: row.note,
                amount,
                currency: row.currency,
                convertedAmount,
                expenseDate: row.expense_date,
                category: row.category,
                payerId: row.payer_id,
                payerName: row.payer_name ?? null,
                authorId: row.author_id,
                participants: Array.isArray(row.participants) ? row.participants : [],
            };
        }));
        // 캐시에 저장
        await this.setCachedExpenseList(cacheKey, { total, items });
        return { total, page, limit, items };
    }
    /**
     * 지출을 수정합니다.
     * 권한: 지출 작성자만 수정 가능
     */
    async updateExpense(travelId, expenseId, userId, payload) {
        const pool = await (0, pool_1.getPool)();
        // 1. 사용자가 여행 멤버인지 확인
        const context = await this.getTravelContext(travelId, userId);
        // 2. 기존 지출 정보 조회 및 권한 확인
        const existingExpenseResult = await pool.query(`SELECT
         e.id::text,
         e.travel_id::text,
         e.author_id::text
       FROM travel_expenses e
       WHERE e.id = $1 AND e.travel_id = $2`, [expenseId, travelId]);
        const existingExpense = existingExpenseResult.rows[0];
        if (!existingExpense) {
            throw new common_1.NotFoundException('지출을 찾을 수 없습니다.');
        }
        // 3. 권한 확인: 지출 작성자만 수정 가능
        if (existingExpense.author_id !== userId) {
            throw new common_1.ForbiddenException('지출 작성자만 수정할 수 있습니다.');
        }
        const payerId = payload.payerId ?? userId;
        this.ensurePayer(context.memberIds, payerId);
        const participantIds = this.normalizeParticipants(context.memberIds, payload.participantIds);
        if (participantIds.length === 0) {
            throw new common_1.BadRequestException('최소 한 명 이상의 참여자가 필요합니다.');
        }
        // 환율 변환
        const convertedAmount = await this.convertAmount(payload.amount, payload.currency, 'KRW', context.baseExchangeRate);
        const splitAmount = Number((convertedAmount / participantIds.length).toFixed(2));
        // 4. 트랜잭션으로 지출 수정
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // 기존 지출 정보 업데이트
            const expenseResult = await client.query(`UPDATE travel_expenses
         SET title = $3,
             note = $4,
             amount = $5,
             currency = $6,
             converted_amount = $7,
             expense_date = $8,
             category = $9,
             payer_id = $10,
             updated_at = NOW()
         WHERE id = $1 AND travel_id = $2
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
                expenseId,
                travelId,
                payload.title,
                payload.note ?? null,
                payload.amount,
                payload.currency.toUpperCase(),
                convertedAmount,
                payload.expenseDate,
                payload.category ?? null,
                payerId,
            ]);
            const expense = expenseResult.rows[0];
            // 기존 참여자 정보 삭제 후 새로 추가
            await client.query(`DELETE FROM travel_expense_participants WHERE expense_id = $1`, [expenseId]);
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
            const result = {
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
            // 수정 후 캐시 무효화 (동기로 처리해 즉시 반영)
            await this.invalidateExpenseCaches(travelId, expenseId);
            // 지출 수정 알림 이벤트 발송
            const currentUserName = this.getMemberName(context, userId) || '사용자';
            await this.pushNotificationService.sendExpenseNotification('expense_updated', travelId, userId, currentUserName, payload.title, context.memberIds, payload.amount, payload.currency);
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
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
         e.title,
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
            // 삭제 후 캐시 무효화 (동기로 처리해 즉시 반영)
            await this.invalidateExpenseCaches(travelId, expenseId);
            // 지출 삭제 알림 이벤트 발송
            const currentUserName = this.getMemberName(context, userId) || '사용자';
            await this.pushNotificationService.sendExpenseNotification('expense_deleted', travelId, userId, currentUserName, expense.title, context.memberIds);
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
    __metadata("design:paramtypes", [meta_service_1.MetaService,
        cacheService_1.CacheService,
        event_emitter_1.EventEmitter2,
        push_notification_service_1.PushNotificationService])
], TravelExpenseService);
