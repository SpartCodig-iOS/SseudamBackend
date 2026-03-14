import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { CacheService } from '../../cache-shared/services/cacheService';
// import { AppMetricsService } from '../../../common/metrics/app-metrics.service'; // ObservabilityModule disabled

// ─────────────────────────────────────────────────────────────────────────────
// 도메인 타입
// ─────────────────────────────────────────────────────────────────────────────

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

export interface SettlementStatistics {
  totalExpenseAmount: number;
  myPaidAmount: number;
  mySharedAmount: number;
  myBalance: number;
  balanceStatus: 'receive' | 'pay' | 'settled';
  memberBalances: Array<{
    memberId: string;
    memberName: string;
    balance: number;
    balanceStatus: 'receive' | 'pay' | 'settled';
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 내부 알고리즘 결과 타입
// ─────────────────────────────────────────────────────────────────────────────

interface ComputedSettlement {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class TravelSettlementService {
  private readonly logger = new Logger(TravelSettlementService.name);
  private readonly SETTLEMENT_PREFIX = 'settlement:summary';
  private readonly SETTLEMENT_TTL = 60; // 1분 캐시 (실시간성 강화)

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly cacheService: CacheService,
    // private readonly metricsService: AppMetricsService, // ObservabilityModule disabled
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Private 헬퍼
  // ───────────────────────────────────────────────────────────────────────────

  private async ensureTransaction<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(callback);
  }

  private async ensureMember(travelId: string, userId: string): Promise<void> {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM travel_members WHERE travel_id = $1 AND user_id = $2 LIMIT 1`,
      [travelId, userId],
    );
    if (!rows[0]) {
      throw new BadRequestException('해당 여행에 대한 접근 권한이 없습니다.');
    }
  }

  private async fetchBalances(travelId: string, manager?: EntityManager): Promise<Balance[]> {
    const db = manager ?? this.dataSource;
    const result = await db.query(
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
    return result.map((row: any) => ({
      memberId: row.member_id,
      name: row.name,
      balance: Number(row.balance),
    }));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 정산 알고리즘 (public for testing)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * 잔액 배열을 받아 최소 거래 수로 정산 쌍을 계산한다.
   *
   * - 채권자(balance > 0)와 채무자(balance < 0)를 금액 내림차순 정렬
   * - Greedy two-pointer 방식으로 거래 횟수를 최소화
   * - 소수점 오차는 2자리 반올림으로 처리, 0.01 이하 잔액은 정산 완료로 간주
   */
  public calculateSettlements(balances: Balance[]): ComputedSettlement[] {
    // 단일 멤버 또는 모든 잔액 0 → 정산 불필요
    if (balances.length <= 1) return [];

    const EPSILON = 0.01;

    const creditors = balances
      .filter((b) => b.balance > EPSILON)
      .map((b) => ({ ...b }))
      .sort((a, b) => b.balance - a.balance);

    const debtors = balances
      .filter((b) => b.balance < -EPSILON)
      .map((b) => ({ ...b, balance: -b.balance })) // 양수로 변환
      .sort((a, b) => b.balance - a.balance);

    const settlements: ComputedSettlement[] = [];
    let i = 0;
    let j = 0;

    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      const amount = Number(Math.min(debtor.balance, creditor.balance).toFixed(2));

      if (amount > EPSILON) {
        settlements.push({
          id: randomUUID(),
          fromMemberId: debtor.memberId,
          toMemberId: creditor.memberId,
          amount,
        });
      }

      debtor.balance = Number((debtor.balance - amount).toFixed(2));
      creditor.balance = Number((creditor.balance - amount).toFixed(2));

      if (debtor.balance <= EPSILON) i++;
      if (creditor.balance <= EPSILON) j++;
    }

    return settlements;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 감사 로그 기록
  // ───────────────────────────────────────────────────────────────────────────

  private async writeAuditLog(
    manager: EntityManager,
    params: {
      travelId: string;
      settlementId?: string | null;
      actorId: string;
      action: 'save_computed' | 'mark_completed' | 'delete_all';
      oldStatus?: string | null;
      newStatus?: string | null;
      oldVersion?: number | null;
      newVersion?: number | null;
      meta?: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      await manager.query(
        `INSERT INTO settlement_audit_logs
           (travel_id, settlement_id, actor_id, action,
            old_status, new_status, old_version, new_version, meta)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
        [
          params.travelId,
          params.settlementId ?? null,
          params.actorId,
          params.action,
          params.oldStatus ?? null,
          params.newStatus ?? null,
          params.oldVersion ?? null,
          params.newVersion ?? null,
          params.meta ? JSON.stringify(params.meta) : null,
        ],
      );
    } catch (err) {
      // 감사 로그 실패가 핵심 기능에 영향 주면 안 되므로 warn 처리
      this.logger.warn(
        `[AuditLog] Failed to write audit log for ${params.action} on travel ${params.travelId}: ${(err as Error).message}`,
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────────

  async getSettlementSummary(travelId: string, userId: string): Promise<SettlementSummary> {
    const cacheKey = travelId;

    try {
      const cached = await this.cacheService.get<SettlementSummary>(cacheKey, {
        prefix: this.SETTLEMENT_PREFIX,
      });
      if (cached) {
        return cached;
      }
    } catch {
      // 캐시 미스는 무시하고 DB 조회로 진행
    }

    await this.ensureMember(travelId, userId);

    const [balances, storedSettlements] = await Promise.all([
      this.fetchBalances(travelId),
      this.dataSource.query(
        `SELECT
           ts.id::text,
           ts.from_member::text,
           ts.to_member::text,
           ts.amount,
           ts.status,
           ts.updated_at::text,
           ts.version,
           from_profile.name AS from_name,
           to_profile.name   AS to_name
         FROM travel_settlements ts
         LEFT JOIN profiles from_profile ON from_profile.id = ts.from_member
         LEFT JOIN profiles to_profile   ON to_profile.id   = ts.to_member
         WHERE ts.travel_id = $1
         ORDER BY ts.created_at ASC`,
        [travelId],
      ),
    ]);

    const nameMap = new Map(balances.map((b) => [b.memberId, b.name ?? '알 수 없음']));
    const computedSettlements = this.calculateSettlements(balances);

    const savedSettlements = storedSettlements.map((row: any) => ({
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

    const summary: SettlementSummary = { balances, savedSettlements, recommendedSettlements };

    this.cacheService
      .set(cacheKey, summary, { prefix: this.SETTLEMENT_PREFIX, ttl: this.SETTLEMENT_TTL })
      .catch(() => undefined);

    return summary;
  }

  /**
   * 계산된 정산 결과를 DB에 저장한다.
   *
   * 낙관적 락: 트랜잭션 내부에서 기존 버전을 확인하고,
   * 재정산 요청이 동시에 두 번 들어와도 두 번째 요청은 ConflictException으로 실패한다.
   *
   * 멱등성 키(idempotencyKey): 클라이언트가 동일 키로 재요청할 경우
   * 이미 처리된 결과를 그대로 반환하여 중복 저장을 방지한다.
   */
  async saveComputedSettlements(
    travelId: string,
    userId: string,
    options: { idempotencyKey?: string } = {},
  ): Promise<SettlementSummary> {
    await this.ensureMember(travelId, userId);

    // 멱등성 키 체크: 동일 키가 이미 처리된 경우 캐시 결과 반환
    if (options.idempotencyKey) {
      const idempotencyPrefix = 'settlement:idempotency';
      try {
        const existingResult = await this.cacheService.get<SettlementSummary>(
          options.idempotencyKey,
          { prefix: idempotencyPrefix },
        );
        if (existingResult) {
          this.logger.debug(
            `[saveComputedSettlements] Idempotent replay for key=${options.idempotencyKey} travelId=${travelId}`,
          );
          return existingResult;
        }
      } catch {
        // 캐시 미스 → 정상 처리 계속
      }
    }

    // 현재 최대 버전 조회 (낙관적 락 기준값)
    const versionRows = await this.dataSource.query(
      `SELECT COALESCE(MAX(version), 0) AS max_version
       FROM travel_settlements
       WHERE travel_id = $1`,
      [travelId],
    );
    const currentVersion: number = Number(versionRows[0]?.max_version ?? 0);
    const nextVersion = currentVersion + 1;

    const balances = await this.fetchBalances(travelId);
    const computedSettlements = this.calculateSettlements(balances);

    if (computedSettlements.length === 0) {
      throw new BadRequestException('정산할 항목이 없습니다.');
    }

    await this.ensureTransaction(async (manager) => {
      // 낙관적 락: 트랜잭션 내에서 버전이 여전히 동일한지 재확인
      const lockRows = await manager.query(
        `SELECT COALESCE(MAX(version), 0) AS max_version
         FROM travel_settlements
         WHERE travel_id = $1
         FOR UPDATE`,
        [travelId],
      );
      const lockedVersion = Number(lockRows[0]?.max_version ?? 0);

      if (lockedVersion !== currentVersion) {
        throw new ConflictException(
          '다른 사용자가 동시에 정산을 수정했습니다. 최신 정산 내역을 확인한 후 다시 시도해주세요.',
        );
      }

      // 기존 정산 전부 삭제 후 재삽입
      await manager.query(
        `DELETE FROM travel_settlements WHERE travel_id = $1`,
        [travelId],
      );

      // 배치 INSERT (UNNEST 방식 — N=1 쿼리)
      const ids = computedSettlements.map((s) => s.id);
      const travelIds = Array(computedSettlements.length).fill(travelId);
      const fromMembers = computedSettlements.map((s) => s.fromMemberId);
      const toMembers = computedSettlements.map((s) => s.toMemberId);
      const amounts = computedSettlements.map((s) => s.amount);
      const versions = Array(computedSettlements.length).fill(nextVersion);

      await manager.query(
        `INSERT INTO travel_settlements
           (id, travel_id, from_member, to_member, amount, version)
         SELECT *
         FROM UNNEST(
           $1::uuid[],
           $2::uuid[],
           $3::uuid[],
           $4::uuid[],
           $5::numeric[],
           $6::integer[]
         ) AS t(id, travel_id, from_member, to_member, amount, version)`,
        [ids, travelIds, fromMembers, toMembers, amounts, versions],
      );

      // 감사 로그 기록
      await this.writeAuditLog(manager, {
        travelId,
        actorId: userId,
        action: 'save_computed',
        oldVersion: currentVersion,
        newVersion: nextVersion,
        meta: {
          settlementCount: computedSettlements.length,
          memberCount: balances.length,
        },
      });
    });

    await this.cacheService
      .del(travelId, { prefix: this.SETTLEMENT_PREFIX })
      .catch(() => undefined);

    const result = await this.getSettlementSummary(travelId, userId);

    // 멱등성 키 캐싱 (5분 보존)
    if (options.idempotencyKey) {
      const idempotencyPrefix = 'settlement:idempotency';
      this.cacheService
        .set(options.idempotencyKey, result, { prefix: idempotencyPrefix, ttl: 300 })
        .catch(() => undefined);
    }

    this.logger.log(
      `[saveComputedSettlements] travelId=${travelId} actor=${userId} ` +
        `settlements=${computedSettlements.length} version=${currentVersion}->${nextVersion}`,
    );

    // this.metricsService?.recordSettlementCalculated(travelId, 'success'); // 임시 비활성화
    return result;
  }

  async markSettlementCompleted(
    travelId: string,
    userId: string,
    settlementId: string,
  ): Promise<SettlementSummary> {
    await this.ensureMember(travelId, userId);

    let oldStatus: string | null = null;
    let newVersion: number | null = null;

    await this.ensureTransaction(async (manager) => {
      // 현재 상태 조회 (FOR UPDATE로 동시 수정 방지)
      const currentRows = await manager.query(
        `SELECT status, version
         FROM travel_settlements
         WHERE id = $1 AND travel_id = $2
         FOR UPDATE`,
        [settlementId, travelId],
      );

      if (!currentRows[0]) {
        throw new BadRequestException(
          '정산 내역을 찾을 수 없습니다. 계산된 결과를 저장한 뒤 완료 처리하세요.',
        );
      }

      oldStatus = currentRows[0].status as string;
      const currentRowVersion = Number(currentRows[0].version ?? 1);
      newVersion = currentRowVersion + 1;

      // 이미 완료된 경우 멱등성 보장 (재처리 무시)
      if (oldStatus === 'completed') {
        this.logger.debug(
          `[markSettlementCompleted] settlementId=${settlementId} already completed, skipping`,
        );
        return;
      }

      const rows = await manager.query(
        `UPDATE travel_settlements
         SET status       = 'completed',
             completed_at = NOW(),
             updated_at   = NOW(),
             version      = $3
         WHERE id = $1 AND travel_id = $2 AND version = $4
         RETURNING id`,
        [settlementId, travelId, newVersion, currentRowVersion],
      );

      // affected 0 → 다른 트랜잭션이 선점 수정
      if (!rows[0]) {
        throw new ConflictException(
          '다른 사용자가 동시에 동일 정산을 수정했습니다. 잠시 후 다시 시도해주세요.',
        );
      }

      await this.writeAuditLog(manager, {
        travelId,
        settlementId,
        actorId: userId,
        action: 'mark_completed',
        oldStatus,
        newStatus: 'completed',
        oldVersion: currentRowVersion,
        newVersion,
      });
    });

    await this.cacheService
      .del(travelId, { prefix: this.SETTLEMENT_PREFIX })
      .catch(() => undefined);

    return this.getSettlementSummary(travelId, userId);
  }

  async getSettlementStatistics(travelId: string, userId: string): Promise<SettlementStatistics> {
    await this.ensureMember(travelId, userId);

    const [statsRows, balancesResult] = await Promise.all([
      this.dataSource.query(
        `WITH travel_totals AS (
           SELECT SUM(converted_amount) AS total_expense_amount
           FROM travel_expenses
           WHERE travel_id = $1
         ),
         my_paid AS (
           SELECT COALESCE(SUM(converted_amount), 0) AS my_paid_amount
           FROM travel_expenses
           WHERE travel_id = $1 AND payer_id = $2
         ),
         my_shared AS (
           SELECT COALESCE(SUM(tep.split_amount), 0) AS my_shared_amount
           FROM travel_expense_participants tep
           INNER JOIN travel_expenses te ON te.id = tep.expense_id
           WHERE te.travel_id = $1 AND tep.member_id = $2
         )
         SELECT
           travel_totals.total_expense_amount,
           my_paid.my_paid_amount,
           my_shared.my_shared_amount,
           (my_paid.my_paid_amount - my_shared.my_shared_amount) AS my_balance
         FROM travel_totals, my_paid, my_shared`,
        [travelId, userId],
      ),
      this.fetchBalances(travelId),
    ]);

    const row = statsRows[0];
    if (!row) {
      return {
        totalExpenseAmount: 0,
        myPaidAmount: 0,
        mySharedAmount: 0,
        myBalance: 0,
        balanceStatus: 'settled',
        memberBalances: [],
      };
    }

    const totalExpenseAmount = Number(row.total_expense_amount || 0);
    const myPaidAmount = Number(row.my_paid_amount || 0);
    const mySharedAmount = Number(row.my_shared_amount || 0);
    const myBalance = Number(row.my_balance || 0);

    const getBalanceStatus = (balance: number): 'receive' | 'pay' | 'settled' => {
      if (Math.abs(balance) <= 1) return 'settled';
      if (balance > 0) return 'receive';
      return 'pay';
    };

    const memberBalances = balancesResult.map((member) => ({
      memberId: member.memberId,
      memberName: member.name || '알 수 없음',
      balance: member.balance,
      balanceStatus: getBalanceStatus(member.balance),
    }));

    return {
      totalExpenseAmount,
      myPaidAmount,
      mySharedAmount,
      myBalance,
      balanceStatus: getBalanceStatus(myBalance),
      memberBalances,
    };
  }
}
