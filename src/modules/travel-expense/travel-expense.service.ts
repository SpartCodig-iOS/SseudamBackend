import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getPool } from '../../db/pool';
import { CreateExpenseInput } from '../../validators/travelExpenseSchemas';
import { MetaService } from '../meta/meta.service';

interface TravelContext {
  id: string;
  baseCurrency: string;
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
  payerId: string;
  payerName: string | null;
  participants: Array<{
    memberId: string;
    name: string | null;
  }>;
}

@Injectable()
export class TravelExpenseService {
  constructor(private readonly metaService: MetaService) {}

  private async getTravelContext(travelId: string, userId: string): Promise<TravelContext> {
    const pool = await getPool();
    const result = await pool.query(
      `SELECT
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
    return {
      id: row.id,
      baseCurrency: row.base_currency,
      memberIds,
      memberNameMap,
    };
  }

  private async convertAmount(
    amount: number,
    currency: string,
    targetCurrency: string,
  ): Promise<number> {
    if (currency === targetCurrency) {
      return amount;
    }
    const conversion = await this.metaService.getExchangeRate(currency, targetCurrency, amount);
    return Number(conversion.quoteAmount);
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

  async createExpense(
    travelId: string,
    userId: string,
    payload: CreateExpenseInput,
  ): Promise<TravelExpense> {
    const context = await this.getTravelContext(travelId, userId);
    const payerId = payload.payerId ?? userId;
    this.ensurePayer(context.memberIds, payerId);

    const participantIds = this.normalizeParticipants(context.memberIds, payload.participantIds);
    if (participantIds.length === 0) {
      throw new BadRequestException('최소 한 명 이상의 참여자가 필요합니다.');
    }

    const convertedAmount = await this.convertAmount(
      payload.amount,
      payload.currency,
      context.baseCurrency,
    );
    const splitAmount = Number((convertedAmount / participantIds.length).toFixed(2));

    const pool = await getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const expenseResult = await client.query(
        `INSERT INTO travel_expenses
           (travel_id, title, note, amount, currency, converted_amount, expense_date, category, payer_id)
         VALUES
           ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING
           id::text,
           title,
           note,
           amount,
           currency,
           converted_amount,
           expense_date::text,
           category,
           payer_id::text`,
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

      return {
        id: expense.id,
        title: expense.title,
        note: expense.note,
        amount: Number(expense.amount),
        currency: expense.currency,
        convertedAmount: Number(expense.converted_amount),
        expenseDate: expense.expense_date,
        category: expense.category,
        payerId: expense.payer_id,
        payerName,
        participants,
      };
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
    await this.getTravelContext(travelId, userId);
    const pool = await getPool();
    const page = Math.max(1, pagination.page ?? 1);
    const limit = Math.min(100, Math.max(1, pagination.limit ?? 20));
    const offset = (page - 1) * limit;

    const totalPromise = pool.query(
      `SELECT COUNT(*)::int AS total
       FROM travel_expenses
       WHERE travel_id = $1`,
      [travelId],
    );

    const listPromise = pool.query(
      `SELECT
         e.id::text,
         e.title,
         e.note,
         e.amount,
         e.currency,
         e.converted_amount,
         e.expense_date::text,
         e.category,
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
       LIMIT $2 OFFSET $3`,
      [travelId, limit, offset],
    );

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
        participants:
          row.participants?.map((participant: any) => ({
            memberId: participant.memberId,
            name: participant.name ?? null,
          })) ?? [],
      })),
    };
  }
}
