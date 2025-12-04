import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { getPool } from '../../db/pool';
import { CacheService } from '../../services/cacheService';

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
  private readonly SETTLEMENT_PREFIX = 'settlement:summary';
  private readonly SETTLEMENT_TTL = 60; // 1분으로 단축 (실시간성 강화)

  constructor(private readonly cacheService: CacheService) {}

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

  private async ensureMember(travelId: string, userId: string, pool?: Pool): Promise<void> {
    const targetPool = pool ?? (await getPool());
    const result = await targetPool.query(
      `SELECT 1 FROM travel_members WHERE travel_id = $1 AND user_id = $2 LIMIT 1`,
      [travelId, userId],
    );
    if (!result.rows[0]) {
      throw new BadRequestException('해당 여행에 대한 접근 권한이 없습니다.');
    }
  }

  private async fetchBalances(travelId: string, pool?: Pool): Promise<Balance[]> {
    const targetPool = pool ?? (await getPool());
    const result = await targetPool.query(
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
    const pool = await getPool();
    const cacheKey = travelId;

    try {
      const cached = await this.cacheService.get<SettlementSummary>(cacheKey, { prefix: this.SETTLEMENT_PREFIX });
      if (cached) {
        return cached;
      }
    } catch {
      // ignore cache miss
    }

    await this.ensureMember(travelId, userId, pool);
    const [balances, storedSettlements] = await Promise.all([
      this.fetchBalances(travelId, pool),
      pool.query(
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
      ),
    ]);
    const nameMap = new Map(balances.map((b) => [b.memberId, b.name ?? '알 수 없음']));
    const storedRows = storedSettlements.rows;

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

    const summary = {
      balances,
      savedSettlements,
      recommendedSettlements,
    };

    this.cacheService.set(cacheKey, summary, { prefix: this.SETTLEMENT_PREFIX, ttl: this.SETTLEMENT_TTL }).catch(() => undefined);

    return summary;
  }

  async saveComputedSettlements(travelId: string, userId: string): Promise<SettlementSummary> {
    const pool = await getPool();
    await this.ensureMember(travelId, userId, pool);
    const balances = await this.fetchBalances(travelId, pool);
    const computedSettlements = this.calculateSettlements(balances);
    if (computedSettlements.length === 0) {
      throw new BadRequestException('정산할 항목이 없습니다.');
    }
    await this.ensureTransaction(async (client) => {
      await client.query(`DELETE FROM travel_settlements WHERE travel_id = $1`, [travelId]);

      // 배치 INSERT로 성능 최적화 (100개 정산 = 1번 쿼리)
      if (computedSettlements.length > 0) {
        const ids = computedSettlements.map(item => item.id);
        const travelIds = Array(computedSettlements.length).fill(travelId);
        const fromMembers = computedSettlements.map(item => item.fromMemberId);
        const toMembers = computedSettlements.map(item => item.toMemberId);
        const amounts = computedSettlements.map(item => item.amount);

        await client.query(
          `INSERT INTO travel_settlements (id, travel_id, from_member, to_member, amount)
           SELECT * FROM UNNEST($1::uuid[], $2::uuid[], $3::uuid[], $4::uuid[], $5::numeric[])
           AS t(id, travel_id, from_member, to_member, amount)`,
          [ids, travelIds, fromMembers, toMembers, amounts]
        );
      }
    }, pool);
    await this.cacheService.del(travelId, { prefix: this.SETTLEMENT_PREFIX }).catch(() => undefined);
    return this.getSettlementSummary(travelId, userId);
  }

  async markSettlementCompleted(
    travelId: string,
    userId: string,
    settlementId: string,
  ): Promise<SettlementSummary> {
    const pool = await getPool();
    await this.ensureMember(travelId, userId, pool);
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
    await this.cacheService.del(travelId, { prefix: this.SETTLEMENT_PREFIX }).catch(() => undefined);
    return this.getSettlementSummary(travelId, userId);
  }
}
