/**
 * TravelSettlementController 단위 테스트
 *
 * 테스트 대상:
 *   1. GET  /:travelId/settlements           → getSummary (정상)
 *   2. GET  /:travelId/settlements           → getSummary (인증 없음 → UnauthorizedException)
 *   3. POST /:travelId/settlements/compute   → saveComputed (정상)
 *   4. POST /:travelId/settlements/compute   → saveComputed (Idempotency-Key 포함)
 *   5. PATCH /:travelId/settlements/:id/complete → markComplete (정상)
 *   6. GET  /:travelId/settlements/statistics → getStatistics (정상)
 *   7. GET  /:travelId/settlements/statistics → getStatistics (인증 없음 → UnauthorizedException)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { UnauthorizedException } from '@nestjs/common';
import { TravelSettlementController } from '../modules/travel-settlement/travel-settlement.controller';

// ─────────────────────────────────────────────────────────────────────────────
// 픽스처
// ─────────────────────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-settle-001',
  email: 'settle@example.com',
  name: '정산왕',
  role: 'user',
};

const mockSummary = {
  balances: [
    { memberId: 'user-settle-001', name: '정산왕', balance: 15000 },
    { memberId: 'user-settle-002', name: '빚쟁이', balance: -15000 },
  ],
  savedSettlements: [],
  recommendedSettlements: [
    {
      id: 'settlement-001',
      fromMember: 'user-settle-002',
      toMember: 'user-settle-001',
      amount: 15000,
      status: 'pending',
      updatedAt: '2025-11-01T00:00:00.000Z',
    },
  ],
};

const mockStatistics = {
  totalExpenseAmount: 30000,
  myPaidAmount: 30000,
  mySharedAmount: 15000,
  myBalance: 15000,
  balanceStatus: 'receive' as const,
  memberBalances: [
    { memberId: 'user-settle-002', memberName: '빚쟁이', balance: -15000, balanceStatus: 'pay' as const },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Mock 빌더
// ─────────────────────────────────────────────────────────────────────────────

function buildMockSettlementService(overrides: Record<string, any> = {}) {
  return {
    getSettlementSummary: async () => mockSummary,
    saveComputedSettlements: async () => mockSummary,
    markSettlementCompleted: async () => mockSummary,
    getSettlementStatistics: async () => mockStatistics,
    calculateSettlements: (_balances: any[]) => [],
    ...overrides,
  } as any;
}

function buildRequest(user: any, headers: Record<string, string> = {}) {
  return {
    currentUser: user,
    headers,
    query: {},
  } as any;
}

function buildController(serviceOverrides: Record<string, any> = {}) {
  return new TravelSettlementController(buildMockSettlementService(serviceOverrides));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. getSummary — 정상
// ─────────────────────────────────────────────────────────────────────────────

test('TravelSettlementController.getSummary: 인증된 사용자 → 정산 요약 반환', async () => {
  const controller = buildController();
  const req = buildRequest(mockUser);

  const result = await controller.getSummary('travel-xyz', req);

  assert.ok(result, '결과가 있어야 한다');
  assert.equal((result as any).code, 200);
  assert.ok((result as any).data, 'data가 있어야 한다');
  assert.ok((result as any).data.balances, 'balances가 있어야 한다');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. getSummary — 인증 없음
// ─────────────────────────────────────────────────────────────────────────────

test('TravelSettlementController.getSummary: currentUser 없음 → UnauthorizedException', async () => {
  const controller = buildController();
  const req = buildRequest(null);

  await assert.rejects(
    () => controller.getSummary('travel-xyz', req),
    (err: any) => {
      assert.ok(err instanceof UnauthorizedException);
      return true;
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. saveComputed — 정상 (Idempotency-Key 없음)
// ─────────────────────────────────────────────────────────────────────────────

test('TravelSettlementController.saveComputed: 정상 정산 계산 저장', async () => {
  const controller = buildController();
  const req = buildRequest(mockUser);

  const result = await controller.saveComputed('travel-xyz', req, undefined);

  assert.ok(result);
  assert.equal((result as any).code, 200);
  assert.ok((result as any).data.recommendedSettlements);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. saveComputed — Idempotency-Key 포함
// ─────────────────────────────────────────────────────────────────────────────

test('TravelSettlementController.saveComputed: Idempotency-Key 포함 → 멱등성 처리', async () => {
  let capturedKey: string | undefined;

  const controller = buildController({
    saveComputedSettlements: async (_travelId: string, _userId: string, opts: any) => {
      capturedKey = opts?.idempotencyKey;
      return mockSummary;
    },
  });
  const req = buildRequest(mockUser);

  await controller.saveComputed('travel-xyz', req, 'idem-key-12345');

  assert.equal(capturedKey, 'idem-key-12345', 'Idempotency-Key가 서비스로 전달되어야 한다');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. markComplete — 정상 처리
// ─────────────────────────────────────────────────────────────────────────────

test('TravelSettlementController.markComplete: 정산 완료 처리 성공', async () => {
  const controller = buildController();
  const req = buildRequest(mockUser);

  const result = await controller.markComplete('travel-xyz', 'settlement-001', req);

  assert.ok(result);
  assert.equal((result as any).code, 200);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. getStatistics — 정상
// ─────────────────────────────────────────────────────────────────────────────

test('TravelSettlementController.getStatistics: 인증된 사용자 → 통계 반환', async () => {
  const controller = buildController();
  const req = buildRequest(mockUser);

  const result = await controller.getStatistics('travel-xyz', req);

  assert.ok(result);
  assert.equal((result as any).code, 200);
  const data = (result as any).data;
  assert.ok(typeof data.totalExpenseAmount === 'number');
  assert.ok(typeof data.myBalance === 'number');
  assert.equal(data.balanceStatus, 'receive');
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. getStatistics — 인증 없음
// ─────────────────────────────────────────────────────────────────────────────

test('TravelSettlementController.getStatistics: currentUser 없음 → UnauthorizedException', async () => {
  const controller = buildController();
  const req = buildRequest(null);

  await assert.rejects(
    () => controller.getStatistics('travel-xyz', req),
    (err: any) => {
      assert.ok(err instanceof UnauthorizedException);
      return true;
    },
  );
});
