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
exports.TravelSettlementService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const pool_1 = require("../../db/pool");
const cacheService_1 = require("../../services/cacheService");
let TravelSettlementService = class TravelSettlementService {
    constructor(cacheService) {
        this.cacheService = cacheService;
        this.SETTLEMENT_PREFIX = 'settlement:summary';
        this.SETTLEMENT_TTL = 5 * 60; // 5분
    }
    async ensureTransaction(callback, poolInput) {
        const pool = poolInput ?? (await (0, pool_1.getPool)());
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
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
    async ensureMember(travelId, userId, pool) {
        const targetPool = pool ?? (await (0, pool_1.getPool)());
        const result = await targetPool.query(`SELECT 1 FROM travel_members WHERE travel_id = $1 AND user_id = $2 LIMIT 1`, [travelId, userId]);
        if (!result.rows[0]) {
            throw new common_1.BadRequestException('해당 여행에 대한 접근 권한이 없습니다.');
        }
    }
    async fetchBalances(travelId, pool) {
        const targetPool = pool ?? (await (0, pool_1.getPool)());
        const result = await targetPool.query(`WITH paid AS (
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
       WHERE tm.travel_id = $1`, [travelId]);
        return result.rows.map((row) => ({
            memberId: row.member_id,
            name: row.name,
            balance: Number(row.balance),
        }));
    }
    calculateSettlements(balances) {
        const creditors = balances.filter((b) => b.balance > 0).sort((a, b) => b.balance - a.balance);
        const debtors = balances.filter((b) => b.balance < 0).map((b) => ({ ...b, balance: -b.balance })).sort((a, b) => b.balance - a.balance);
        const settlements = [];
        let i = 0;
        let j = 0;
        while (i < debtors.length && j < creditors.length) {
            const debtor = debtors[i];
            const creditor = creditors[j];
            const amount = Math.min(debtor.balance, creditor.balance);
            settlements.push({
                id: (0, crypto_1.randomUUID)(),
                fromMemberId: debtor.memberId,
                toMemberId: creditor.memberId,
                amount: Number(amount.toFixed(2)),
            });
            debtor.balance -= amount;
            creditor.balance -= amount;
            if (debtor.balance <= 0.01)
                i++;
            if (creditor.balance <= 0.01)
                j++;
        }
        return settlements;
    }
    async getSettlementSummary(travelId, userId) {
        const pool = await (0, pool_1.getPool)();
        const cacheKey = travelId;
        try {
            const cached = await this.cacheService.get(cacheKey, { prefix: this.SETTLEMENT_PREFIX });
            if (cached) {
                return cached;
            }
        }
        catch {
            // ignore cache miss
        }
        await this.ensureMember(travelId, userId, pool);
        const [balances, storedSettlements] = await Promise.all([
            this.fetchBalances(travelId, pool),
            pool.query(`SELECT
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
         ORDER BY ts.created_at ASC`, [travelId]),
        ]);
        const nameMap = new Map(balances.map((b) => [b.memberId, b.name ?? '알 수 없음']));
        const storedRows = storedSettlements.rows;
        const computedSettlements = this.calculateSettlements(balances);
        const savedSettlements = storedSettlements.rows.map((row) => ({
            id: row.id,
            fromMember: row.from_name ?? nameMap.get(row.from_member) ?? '알 수 없음',
            toMember: row.to_name ?? nameMap.get(row.to_member) ?? '알 수 없음',
            amount: Number(row.amount),
            status: row.status,
            updatedAt: row.updated_at,
        }));
        const recommendedSettlements = computedSettlements.map((item) => ({
            id: item.id,
            fromMember: nameMap.get(item.fromMemberId) ?? '알 수 없음',
            toMember: nameMap.get(item.toMemberId) ?? '알 수 없음',
            amount: item.amount,
            status: 'pending',
            updatedAt: new Date().toISOString(),
        }));
        return {
            balances,
            savedSettlements,
            recommendedSettlements,
        };
        // 캐시 저장
        this.cacheService.set(cacheKey, {
            balances,
            savedSettlements,
            recommendedSettlements,
        }, { prefix: this.SETTLEMENT_PREFIX, ttl: this.SETTLEMENT_TTL }).catch(() => undefined);
        return {
            balances,
            savedSettlements,
            recommendedSettlements,
        };
    }
    async saveComputedSettlements(travelId, userId) {
        const pool = await (0, pool_1.getPool)();
        await this.ensureMember(travelId, userId, pool);
        const balances = await this.fetchBalances(travelId, pool);
        const computedSettlements = this.calculateSettlements(balances);
        if (computedSettlements.length === 0) {
            throw new common_1.BadRequestException('정산할 항목이 없습니다.');
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
                await client.query(`INSERT INTO travel_settlements (id, travel_id, from_member, to_member, amount)
           SELECT * FROM UNNEST($1::uuid[], $2::uuid[], $3::uuid[], $4::uuid[], $5::numeric[])
           AS t(id, travel_id, from_member, to_member, amount)`, [ids, travelIds, fromMembers, toMembers, amounts]);
            }
        }, pool);
        await this.cacheService.del(travelId, { prefix: this.SETTLEMENT_PREFIX }).catch(() => undefined);
        return this.getSettlementSummary(travelId, userId);
    }
    async markSettlementCompleted(travelId, userId, settlementId) {
        const pool = await (0, pool_1.getPool)();
        await this.ensureMember(travelId, userId, pool);
        const result = await pool.query(`UPDATE travel_settlements
       SET status = 'completed', completed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND travel_id = $2
       RETURNING id`, [settlementId, travelId]);
        if (!result.rows[0]) {
            throw new common_1.BadRequestException('정산 내역을 찾을 수 없습니다. 계산된 결과를 저장한 뒤 완료 처리하세요.');
        }
        await this.cacheService.del(travelId, { prefix: this.SETTLEMENT_PREFIX }).catch(() => undefined);
        return this.getSettlementSummary(travelId, userId);
    }
};
exports.TravelSettlementService = TravelSettlementService;
exports.TravelSettlementService = TravelSettlementService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [cacheService_1.CacheService])
], TravelSettlementService);
