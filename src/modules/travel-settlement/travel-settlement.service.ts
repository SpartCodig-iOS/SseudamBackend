import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { CacheService } from '../../common/services/cache.service';
import { AppMetricsService } from '../../common/metrics/app-metrics.service';

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
    private readonly metricsService: AppMetricsService,
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
    const travelMemberRepository = this.dataSource.getRepository('TravelMember');
    const count = await travelMemberRepository.count({
      where: { travelId, userId },
      take: 1
    });
    if (count === 0) {
      throw new BadRequestException('해당 여행에 대한 접근 권한이 없습니다.');
    }
  }

  private async fetchBalances(travelId: string, manager?: EntityManager): Promise<Balance[]> {
    const db = manager ?? this.dataSource;

    // TypeORM으로 복잡한 CTE 쿼리 변환
    const result = await db
      .createQueryBuilder()
      .select('tm.user_id', 'member_id')
      .addSelect('p.name', 'name')
      .addSelect('COALESCE(paid.total_paid, 0) - COALESCE(shared.total_shared, 0)', 'balance')
      .from('travel_members', 'tm')
      .leftJoin('profiles', 'p', 'p.id = tm.user_id')
      .leftJoin(
        (subQuery) => {
          return subQuery
            .select('payer_id', 'member_id')
            .addSelect('SUM(converted_amount)', 'total_paid')
            .from('travel_expenses', 'te_paid')
            .where('te_paid.travel_id = :travelId')
            .groupBy('payer_id');
        },
        'paid',
        'paid.member_id = tm.user_id'
      )
      .leftJoin(
        (subQuery) => {
          return subQuery
            .select('tep.member_id', 'member_id')
            .addSelect('SUM(tep.split_amount)', 'total_shared')
            .from('travel_expense_participants', 'tep')
            .innerJoin('travel_expenses', 'te', 'te.id = tep.expense_id')
            .where('te.travel_id = :travelId')
            .groupBy('tep.member_id');
        },
        'shared',
        'shared.member_id = tm.user_id'
      )
      .where('tm.travel_id = :travelId')
      .setParameter('travelId', travelId)
      .getRawMany();

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
      const auditLogRepository = manager.getRepository('SettlementAuditLog');
      await auditLogRepository.insert({
        travelId: params.travelId,
        settlementId: params.settlementId,
        actorId: params.actorId,
        action: params.action,
        oldStatus: params.oldStatus,
        newStatus: params.newStatus,
        oldVersion: params.oldVersion,
        newVersion: params.newVersion,
        meta: params.meta ? JSON.stringify(params.meta) : null,
      });
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
      this.dataSource.createQueryBuilder()
        .select([
          'ts.id',
          'ts.from_member',
          'ts.to_member',
          'ts.amount',
          'ts.status',
          'ts.updated_at',
          'ts.version',
          'from_profile.name AS from_name',
          'to_profile.name AS to_name'
        ])
        .from('travel_settlements', 'ts')
        .leftJoin('profiles', 'from_profile', 'from_profile.id = ts.from_member')
        .leftJoin('profiles', 'to_profile', 'to_profile.id = ts.to_member')
        .where('ts.travel_id = :travelId', { travelId })
        .orderBy('ts.created_at', 'ASC')
        .getRawMany(),
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
    const versionResult = await this.dataSource.createQueryBuilder()
      .select('COALESCE(MAX(travel_settlements.version), 0)', 'max_version')
      .from('travel_settlements', 'travel_settlements')
      .where('travel_settlements.travel_id = :travelId', { travelId })
      .getRawOne();
    const currentVersion: number = Number(versionResult?.max_version ?? 0);
    const nextVersion = currentVersion + 1;

    const balances = await this.fetchBalances(travelId);
    const computedSettlements = this.calculateSettlements(balances);

    if (computedSettlements.length === 0) {
      throw new BadRequestException('정산할 항목이 없습니다.');
    }

    await this.ensureTransaction(async (manager) => {
      // 낙관적 락: 트랜잭션 내에서 버전이 여전히 동일한지 재확인
      const lockResult = await manager.createQueryBuilder()
        .select('COALESCE(MAX(travel_settlements.version), 0)', 'max_version')
        .from('travel_settlements', 'travel_settlements')
        .where('travel_settlements.travel_id = :travelId', { travelId })
        // FOR UPDATE는 select().forUpdate() 사용
        .setLock('pessimistic_write')
        .getRawOne();
      const lockedVersion = Number(lockResult?.max_version ?? 0);

      if (lockedVersion !== currentVersion) {
        throw new ConflictException(
          '다른 사용자가 동시에 정산을 수정했습니다. 최신 정산 내역을 확인한 후 다시 시도해주세요.',
        );
      }

      // 기존 정산 전부 삭제 후 재삽입
      const settlementRepository = manager.getRepository('TravelSettlement');
      await settlementRepository.delete({ travelId });

      // 배치 INSERT (TypeORM 방식)
      const settlementEntities = computedSettlements.map((settlement) => ({
        id: settlement.id,
        travelId: travelId,
        fromMember: settlement.fromMemberId,
        toMember: settlement.toMemberId,
        amount: settlement.amount,
        version: nextVersion,
        status: 'pending' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await settlementRepository.insert(settlementEntities);

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

    const summaryResult = await this.getSettlementSummary(travelId, userId);

    // 멱등성 키 캐싱 (5분 보존)
    if (options.idempotencyKey) {
      const idempotencyPrefix = 'settlement:idempotency';
      this.cacheService
        .set(options.idempotencyKey, summaryResult, { prefix: idempotencyPrefix, ttl: 300 })
        .catch(() => undefined);
    }

    this.logger.log(
      `[saveComputedSettlements] travelId=${travelId} actor=${userId} ` +
        `settlements=${computedSettlements.length} version=${currentVersion}->${nextVersion}`,
    );

    this.metricsService?.recordSettlementCalculated(travelId, 'success');
    return summaryResult;
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
      const settlementRepository = manager.getRepository('TravelSettlement');
      const currentRecord = await settlementRepository
        .createQueryBuilder('settlement')
        .select(['settlement.status', 'settlement.version'])
        .where('settlement.id = :settlementId AND settlement.travelId = :travelId', { settlementId, travelId })
        .setLock('pessimistic_write')
        .getOne();

      if (!currentRecord) {
        throw new BadRequestException(
          '정산 내역을 찾을 수 없습니다. 계산된 결과를 저장한 뒤 완료 처리하세요.',
        );
      }

      oldStatus = currentRecord.status as string;
      const currentRowVersion = Number(currentRecord.version ?? 1);
      newVersion = currentRowVersion + 1;

      // 이미 완료된 경우 멱등성 보장 (재처리 무시)
      if (oldStatus === 'completed') {
        this.logger.debug(
          `[markSettlementCompleted] settlementId=${settlementId} already completed, skipping`,
        );
        return;
      }

      // TypeORM으로 조건부 업데이트 실행
      const updateResult = await settlementRepository
        .createQueryBuilder()
        .update('TravelSettlement')
        .set({
          status: 'completed',
          completedAt: () => 'NOW()',
          updatedAt: () => 'NOW()',
          version: newVersion
        })
        .where('id = :settlementId AND travelId = :travelId AND version = :currentVersion', {
          settlementId,
          travelId,
          currentVersion: currentRowVersion
        })
        .execute();

      // affected 0 → 다른 트랜잭션이 선점 수정
      if (updateResult.affected === 0) {
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

    const [statsResult, balancesResult] = await Promise.all([
      this.dataSource.createQueryBuilder()
        .select('SUM(te1.converted_amount)', 'total_expense_amount')
        .addSelect('COALESCE(my_paid.my_paid_amount, 0)', 'my_paid_amount')
        .addSelect('COALESCE(my_shared.my_shared_amount, 0)', 'my_shared_amount')
        .addSelect('(COALESCE(my_paid.my_paid_amount, 0) - COALESCE(my_shared.my_shared_amount, 0))', 'my_balance')
        .from('travel_expenses', 'te1')
        .leftJoin(
          (subQuery) => {
            return subQuery
              .select('SUM(converted_amount)', 'my_paid_amount')
              .from('travel_expenses', 'te_paid')
              .where('te_paid.travel_id = :travelId AND te_paid.payer_id = :userId');
          },
          'my_paid',
          '1=1'
        )
        .leftJoin(
          (subQuery) => {
            return subQuery
              .select('SUM(tep.split_amount)', 'my_shared_amount')
              .from('travel_expense_participants', 'tep')
              .innerJoin('travel_expenses', 'te', 'te.id = tep.expense_id')
              .where('te.travel_id = :travelId AND tep.member_id = :userId');
          },
          'my_shared',
          '1=1'
        )
        .where('te1.travel_id = :travelId')
        .setParameters({ travelId, userId })
        .getRawOne(),
      this.fetchBalances(travelId),
    ]);

    const statsRows = [statsResult];

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

    // 942dde8 스타일 안전한 숫자 파싱 적용
    const safeParseAmount = (value: any, fallback: number = 0): number => {
      if (!value || value === '') return fallback;
      const trimmed = typeof value === 'string' ? value.trim() : String(value);
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const totalExpenseAmount = safeParseAmount(row.total_expense_amount);
    const myPaidAmount = safeParseAmount(row.my_paid_amount);
    const mySharedAmount = safeParseAmount(row.my_shared_amount);
    const myBalance = safeParseAmount(row.my_balance);

    const getBalanceStatus = (balance: number): 'receive' | 'pay' | 'settled' => {
      if (Math.abs(balance) <= 1) return 'settled';
      if (balance > 0) return 'receive';
      return 'pay';
    };

    const memberBalances = balancesResult.map((member) => ({
      memberId: member.memberId,
      memberName: member.name || '알 수 없음',
      balance: safeParseAmount(member.balance),
      balanceStatus: getBalanceStatus(safeParseAmount(member.balance)),
    }));

    // 942dde8 스타일 최적화된 응답 구조 반환
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
