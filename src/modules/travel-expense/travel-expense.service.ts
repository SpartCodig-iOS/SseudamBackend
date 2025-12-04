import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { getPool } from '../../db/pool';
import { CreateExpenseInput } from '../../validators/travelExpenseSchemas';
import { MetaService } from '../meta/meta.service';
import { CacheService } from '../../services/cacheService';

interface TravelContext {
  id: string;
  baseCurrency: string;
  baseExchangeRate: number;
  memberIds: string[];
  memberNameMap: Map<string, string | null>;
}

export interface TravelExpense {
  id: string;
  title: string;
  note: string | null;
  amount: number;
  currency: string;
  convertedAmount: number;
  expenseDate: string;
  category: string | null;
  authorId: string;
  payerId: string;
  payerName: string | null;
  participants: Array<{
    memberId: string;
    name: string | null;
  }>;
}

@Injectable()
export class TravelExpenseService {
  constructor(
    private readonly metaService: MetaService,
    private readonly cacheService: CacheService,
  ) {}

  private readonly EXPENSE_LIST_PREFIX = 'expense:list';
  private readonly EXPENSE_DETAIL_PREFIX = 'expense:detail';
  private readonly EXPENSE_LIST_TTL_SECONDS = 600; // 10분 (5배 증가) // 2분
  private readonly EXPENSE_DETAIL_TTL_SECONDS = 600; // 10분
  private readonly CONTEXT_PREFIX = 'expense:context';
  private readonly CONTEXT_TTL_SECONDS = 1800; // 30분 (안정적 데이터)
  private readonly contextCache = new Map<string, { data: TravelContext; expiresAt: number }>();

  private async getTravelContext(travelId: string, userId: string): Promise<TravelContext> {
    const cached = this.contextCache.get(travelId);
    if (cached && cached.expiresAt > Date.now()) {
      if (!cached.data.memberIds.includes(userId)) {
        throw new BadRequestException('해당 여행에 접근 권한이 없습니다.');
      }
      return cached.data;
    }
    try {
      const redisCached = await this.cacheService.get<TravelContext>(travelId, { prefix: this.CONTEXT_PREFIX });
      if (redisCached) {
        this.contextCache.set(travelId, { data: redisCached, expiresAt: Date.now() + this.CONTEXT_TTL_SECONDS * 1000 });
        if (!redisCached.memberIds.includes(userId)) {
          throw new BadRequestException('해당 여행에 접근 권한이 없습니다.');
        }
        return redisCached;
      }
    } catch {
      // ignore and fallback to DB
    }

    const pool = await getPool();
    const result = await pool.query(
      `SELECT
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
       GROUP BY t.id`,
      [travelId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('여행을 찾을 수 없습니다.');
    }
    const rawMembers: Array<{ id: string; name?: string | null }> = row.member_data ?? [];
    const memberIds = rawMembers.map((member) => member.id);
    if (!memberIds.includes(userId)) {
      throw new BadRequestException('해당 여행에 접근 권한이 없습니다.');
    }
    const memberNameMap = new Map<string, string | null>();
    rawMembers.forEach((member) => {
      memberNameMap.set(member.id, member.name ?? null);
    });
    const context: TravelContext = {
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

  private async convertAmount(
    amount: number,
    currency: string,
    targetCurrency: string,
    fallbackRate?: number,
  ): Promise<number> {
    if (currency === targetCurrency) {
      return amount;
    }
    try {
      const conversion = await this.metaService.getExchangeRate(currency, targetCurrency, amount);
      return Number(conversion.quoteAmount);
    } catch (error) {
      if (fallbackRate && targetCurrency === 'KRW' && currency !== targetCurrency) {
        return Number((amount * fallbackRate).toFixed(2));
      }
      // 환율 API 실패 시 fallback: 동일 금액 반환 (추가 오류 방지)
      return amount;
    }
  }

  private normalizeParticipants(memberIds: string[], provided?: string[]): string[] {
    if (!provided || provided.length === 0) {
      return memberIds;
    }
    const invalid = provided.filter((id) => !memberIds.includes(id));
    if (invalid.length > 0) {
      throw new BadRequestException('참여자 목록에 여행 멤버가 아닌 사용자가 포함되어 있습니다.');
    }
    return provided;
  }

  private ensurePayer(memberIds: string[], payerId: string): void {
    if (!memberIds.includes(payerId)) {
      throw new BadRequestException('결제자는 여행 멤버여야 합니다.');
    }
  }

  private getMemberName(context: TravelContext, memberId: string): string | null {
    return context.memberNameMap.get(memberId) ?? null;
  }

  private async invalidateExpenseCaches(travelId: string, expenseId?: string): Promise<void> {
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

  private async getCachedExpenseList(cacheKey: string): Promise<{ total: number; items: TravelExpense[] } | null> {
    try {
      return await this.cacheService.get<{ total: number; items: TravelExpense[] }>(cacheKey, {
        prefix: this.EXPENSE_LIST_PREFIX,
      });
    } catch {
      return null;
    }
  }

  private async setCachedExpenseList(cacheKey: string, payload: { total: number; items: TravelExpense[] }): Promise<void> {
    this.cacheService.set(cacheKey, payload, {
      prefix: this.EXPENSE_LIST_PREFIX,
      ttl: this.EXPENSE_LIST_TTL_SECONDS,
    }).catch(() => undefined);
  }

  private async getCachedExpenseDetail(expenseId: string): Promise<TravelExpense | null> {
    try {
      return await this.cacheService.get<TravelExpense>(expenseId, { prefix: this.EXPENSE_DETAIL_PREFIX });
    } catch {
      return null;
    }
  }

  private async setCachedExpenseDetail(expenseId: string, expense: TravelExpense): Promise<void> {
    this.cacheService.set(expenseId, expense, {
      prefix: this.EXPENSE_DETAIL_PREFIX,
      ttl: this.EXPENSE_DETAIL_TTL_SECONDS,
    }).catch(() => undefined);
  }

  private async invalidateExpenseListAndDetail(travelId: string, expenseId?: string): Promise<void> {
    await this.invalidateExpenseCaches(travelId, expenseId);
  }

  async createExpense(
    travelId: string,
    userId: string,
    payload: CreateExpenseInput,
  ): Promise<TravelExpense> {
    // 컨텍스트 조회와 환율 변환을 병렬로 처리하기 위해 먼저 컨텍스트만 조회
    const context = await this.getTravelContext(travelId, userId);
    const payerId = payload.payerId ?? userId;
    this.ensurePayer(context.memberIds, payerId);

    const participantIds = this.normalizeParticipants(context.memberIds, payload.participantIds);
    if (participantIds.length === 0) {
      throw new BadRequestException('최소 한 명 이상의 참여자가 필요합니다.');
    }

    // 환율 변환은 독립적으로 실행 가능하므로 병렬 처리 대상
    const convertedAmount = await this.convertAmount(
      payload.amount,
      payload.currency,
      'KRW',
      context.baseExchangeRate,
    );
    const splitAmount = Number((convertedAmount / participantIds.length).toFixed(2));

    const pool = await getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const expenseResult = await client.query(
        `INSERT INTO travel_expenses
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
           author_id::text`,
        [
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
        ],
      );

      const expense = expenseResult.rows[0];
      // 배치 INSERT로 성능 최적화
      if (participantIds.length > 0) {
        await client.query(
          `INSERT INTO travel_expense_participants (expense_id, member_id, split_amount)
           SELECT $1, unnest($2::uuid[]), $3`,
          [expense.id, participantIds, splitAmount],
        );
      }

      await client.query('COMMIT');

      const payerName = this.getMemberName(context, payerId);
      const participants = participantIds.map((memberId) => ({
        memberId,
        name: this.getMemberName(context, memberId),
      }));

      const result: TravelExpense = {
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

      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listExpenses(
    travelId: string,
    userId: string,
    pagination: { page?: number; limit?: number } = {},
  ): Promise<{ total: number; page: number; limit: number; items: TravelExpense[] }> {
    const context = await this.getTravelContext(travelId, userId);
    const pool = await getPool();
    const page = Math.max(1, pagination.page ?? 1);
    const limit = Math.min(100, Math.max(1, pagination.limit ?? 20));
    const offset = (page - 1) * limit;
    const cacheKey = `${travelId}:${page}:${limit}`;

    const cached = await this.getCachedExpenseList(cacheKey);
    if (cached) {
      return { total: cached.total, page, limit, items: cached.items };
    }

    // 최적화: 모든 데이터를 한 번에 조회 (JOIN + JSON 집계)
    const combinedResult = await pool.query(
      `WITH expense_list AS (
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
         WHERE e.travel_id = $1
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
       ORDER BY pe.row_num`,
      [travelId, limit, (page - 1) * limit],
    );

    const total = Number(combinedResult.rows[0]?.total_count ?? 0);

    const items = await Promise.all(combinedResult.rows.map(async (row) => {
      const amount = Number(row.amount);
      const convertedAmount = await this.convertAmount(
        amount,
        row.currency,
        'KRW',
        context.baseExchangeRate
      );

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
  async updateExpense(
    travelId: string,
    expenseId: string,
    userId: string,
    payload: CreateExpenseInput,
  ): Promise<TravelExpense> {
    const pool = await getPool();

    // 1. 사용자가 여행 멤버인지 확인
    const context = await this.getTravelContext(travelId, userId);

    // 2. 기존 지출 정보 조회 및 권한 확인
    const existingExpenseResult = await pool.query(
      `SELECT
         e.id::text,
         e.travel_id::text,
         e.author_id::text
       FROM travel_expenses e
       WHERE e.id = $1 AND e.travel_id = $2`,
      [expenseId, travelId],
    );

    const existingExpense = existingExpenseResult.rows[0];
    if (!existingExpense) {
      throw new NotFoundException('지출을 찾을 수 없습니다.');
    }

    // 3. 권한 확인: 지출 작성자만 수정 가능
    if (existingExpense.author_id !== userId) {
      throw new ForbiddenException('지출 작성자만 수정할 수 있습니다.');
    }

    const payerId = payload.payerId ?? userId;
    this.ensurePayer(context.memberIds, payerId);

    const participantIds = this.normalizeParticipants(context.memberIds, payload.participantIds);
    if (participantIds.length === 0) {
      throw new BadRequestException('최소 한 명 이상의 참여자가 필요합니다.');
    }

    // 환율 변환
    const convertedAmount = await this.convertAmount(
      payload.amount,
      payload.currency,
      'KRW',
      context.baseExchangeRate,
    );
    const splitAmount = Number((convertedAmount / participantIds.length).toFixed(2));

    // 4. 트랜잭션으로 지출 수정
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 기존 지출 정보 업데이트
      const expenseResult = await client.query(
        `UPDATE travel_expenses
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
           author_id::text`,
        [
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
        ],
      );

      const expense = expenseResult.rows[0];

      // 기존 참여자 정보 삭제 후 새로 추가
      await client.query(
        `DELETE FROM travel_expense_participants WHERE expense_id = $1`,
        [expenseId],
      );

      if (participantIds.length > 0) {
        await client.query(
          `INSERT INTO travel_expense_participants (expense_id, member_id, split_amount)
           SELECT $1, unnest($2::uuid[]), $3`,
          [expense.id, participantIds, splitAmount],
        );
      }

      await client.query('COMMIT');

      const payerName = this.getMemberName(context, payerId);
      const participants = participantIds.map((memberId) => ({
        memberId,
        name: this.getMemberName(context, memberId),
      }));

      const result: TravelExpense = {
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

      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 지출을 삭제합니다.
   * 권한: 지출 작성자만 삭제 가능
   */
  async deleteExpense(travelId: string, expenseId: string, userId: string): Promise<void> {
    const pool = await getPool();

    // 1. 사용자가 여행 멤버인지 확인
    const context = await this.getTravelContext(travelId, userId);

    // 2. 지출 정보 조회 및 권한 확인
    const expenseResult = await pool.query(
      `SELECT
         e.id::text,
         e.travel_id::text,
         e.payer_id::text,
         e.author_id::text
       FROM travel_expenses e
       WHERE e.id = $1 AND e.travel_id = $2`,
      [expenseId, travelId],
    );

    const expense = expenseResult.rows[0];
    if (!expense) {
      throw new NotFoundException('지출을 찾을 수 없습니다.');
    }

    // 3. 권한 확인: 지출 작성자만 삭제 가능
    if (expense.author_id !== userId) {
      throw new ForbiddenException('지출 작성자만 삭제할 수 있습니다.');
    }

    // 4. 트랜잭션으로 지출 및 관련 데이터 삭제
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 참여자 정보 먼저 삭제 (외래키 제약)
      await client.query(
        `DELETE FROM travel_expense_participants WHERE expense_id = $1`,
        [expenseId],
      );

      // 지출 정보 삭제
      const deleteResult = await client.query(
        `DELETE FROM travel_expenses WHERE id = $1 AND travel_id = $2`,
        [expenseId, travelId],
      );

      if (deleteResult.rowCount === 0) {
        throw new NotFoundException('삭제할 지출을 찾을 수 없습니다.');
      }

      await client.query('COMMIT');

      // 삭제 후 캐시 무효화 (동기로 처리해 즉시 반영)
      await this.invalidateExpenseCaches(travelId, expenseId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
