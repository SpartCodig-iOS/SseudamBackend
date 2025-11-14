import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { getPool } from '../../db/pool';

interface Balance {
  memberId: string;
  name: string | null;
  balance: number;
}

export interface SettlementSummary {
  balances: Balance[];
  savedSettlements: Array<{
    id: string;
    fromMember: string;
    toMember: string;
    amount: number;
    status: 'pending' | 'completed';
    updatedAt: string;
  }>;
  recommendedSettlements: Array<{
    id: string;
    fromMember: string;
    toMember: string;
    amount: number;
    status: 'pending' | 'completed';
    updatedAt: string;
  }>;
}

@Injectable()
export class TravelSettlementService {
  private async ensureTransaction<T>(callback: (client: any) => Promise<T>, poolInput?: any): Promise<T> {
    const pool = poolInput ?? (await getPool());
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async ensureMember(travelId: string, userId: string): Promise<void> {
    const pool = await getPool();
    const result = await pool.query(
      `SELECT 1 FROM travel_members WHERE travel_id = $1 AND user_id = $2 LIMIT 1`,
      [travelId, userId],
    );
    if (!result.rows[0]) {
      throw new BadRequestException('해당 여행에 대한 접근 권한이 없습니다.');
    }
  }

  private async fetchBalances(travelId: string): Promise<Balance[]> {
    const pool = await getPool();
    const result = await pool.query(
      `WITH paid AS (
         SELECT payer_id AS member_id, SUM(converted_amount) AS total_paid
         FROM travel_expenses
         WHERE travel_id = $1
         GROUP BY payer_id
       ),
       shared AS (
         SELECT tep.member_id, SUM(tep.split_amount) AS total_shared
         FROM travel_expense_participants tep
         INNER JOIN travel_expenses te ON te.id = tep.expense_id
         WHERE te.travel_id = $1
         GROUP BY tep.member_id
       )
       SELECT
         tm.user_id::text AS member_id,
         p.name,
         COALESCE(paid.total_paid, 0) - COALESCE(shared.total_shared, 0) AS balance
       FROM travel_members tm
       LEFT JOIN profiles p ON p.id = tm.user_id
       LEFT JOIN paid ON paid.member_id = tm.user_id
       LEFT JOIN shared ON shared.member_id = tm.user_id
       WHERE tm.travel_id = $1`,
      [travelId],
    );
    return result.rows.map((row) => ({
      memberId: row.member_id,
      name: row.name,
      balance: Number(row.balance),
    }));
  }

  private calculateSettlements(balances: Balance[]) {
    const creditors = balances.filter((b) => b.balance > 0).sort((a, b) => b.balance - a.balance);
    const debtors = balances.filter((b) => b.balance < 0).map((b) => ({ ...b, balance: -b.balance })).sort((a, b) => b.balance - a.balance);

    const settlements: Array<{ id: string; fromMemberId: string; toMemberId: string; amount: number }> = [];

    let i = 0;
    let j = 0;

    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      const amount = Math.min(debtor.balance, creditor.balance);

      settlements.push({
        id: randomUUID(),
        fromMemberId: debtor.memberId,
        toMemberId: creditor.memberId,
        amount: Number(amount.toFixed(2)),
      });

      debtor.balance -= amount;
      creditor.balance -= amount;

      if (debtor.balance <= 0.01) i++;
      if (creditor.balance <= 0.01) j++;
    }

    return settlements;
  }

  async getSettlementSummary(travelId: string, userId: string): Promise<SettlementSummary> {
    await this.ensureMember(travelId, userId);
    const balances = await this.fetchBalances(travelId);
    const nameMap = new Map(balances.map((b) => [b.memberId, b.name ?? '알 수 없음']));

    const pool = await getPool();
    const storedSettlements = await pool.query(
      `SELECT
         ts.id::text,
         ts.from_member::text,
         ts.to_member::text,
         ts.amount,
         ts.status,
         ts.updated_at::text,
         from_profile.name AS from_name,
         to_profile.name AS to_name
       FROM travel_settlements ts
       LEFT JOIN profiles from_profile ON from_profile.id = ts.from_member
       LEFT JOIN profiles to_profile ON to_profile.id = ts.to_member
       WHERE ts.travel_id = $1
       ORDER BY ts.created_at ASC`,
      [travelId],
    );

    const computedSettlements = this.calculateSettlements(balances);

    const savedSettlements = storedSettlements.rows.map((row) => ({
      id: row.id,
      fromMember: row.from_name ?? nameMap.get(row.from_member) ?? '알 수 없음',
      toMember: row.to_name ?? nameMap.get(row.to_member) ?? '알 수 없음',
      amount: Number(row.amount),
      status: row.status as 'pending' | 'completed',
      updatedAt: row.updated_at,
    }));

    const recommendedSettlements = computedSettlements.map((item) => ({
      id: item.id,
      fromMember: nameMap.get(item.fromMemberId) ?? '알 수 없음',
      toMember: nameMap.get(item.toMemberId) ?? '알 수 없음',
      amount: item.amount,
      status: 'pending' as const,
      updatedAt: new Date().toISOString(),
    }));

    return {
      balances,
      savedSettlements,
      recommendedSettlements,
    };
  }

  async saveComputedSettlements(travelId: string, userId: string): Promise<SettlementSummary> {
    await this.ensureMember(travelId, userId);
    const balances = await this.fetchBalances(travelId);
    const computedSettlements = this.calculateSettlements(balances);
    if (computedSettlements.length === 0) {
      throw new BadRequestException('정산할 항목이 없습니다.');
    }
    const pool = await getPool();
    await this.ensureTransaction(async (client) => {
      await client.query(`DELETE FROM travel_settlements WHERE travel_id = $1`, [travelId]);
      for (const item of computedSettlements) {
        await client.query(
          `INSERT INTO travel_settlements (id, travel_id, from_member, to_member, amount)
           VALUES ($1, $2, $3, $4, $5)`,
          [item.id, travelId, item.fromMemberId, item.toMemberId, item.amount],
        );
      }
    }, pool);
    return this.getSettlementSummary(travelId, userId);
  }

  async markSettlementCompleted(
    travelId: string,
    userId: string,
    settlementId: string,
  ): Promise<SettlementSummary> {
    await this.ensureMember(travelId, userId);
    const pool = await getPool();
    const result = await pool.query(
      `UPDATE travel_settlements
       SET status = 'completed', completed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND travel_id = $2
       RETURNING id`,
      [settlementId, travelId],
    );
    if (!result.rows[0]) {
      throw new BadRequestException('정산 내역을 찾을 수 없습니다. 계산된 결과를 저장한 뒤 완료 처리하세요.');
    }
    return this.getSettlementSummary(travelId, userId);
  }
}
