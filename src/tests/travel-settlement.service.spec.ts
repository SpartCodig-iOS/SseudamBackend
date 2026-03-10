/**
 * TravelSettlementService 단위 테스트
 *
 * 테스트 대상: calculateSettlements (pure 알고리즘)
 *
 * 케이스:
 *   1. 기본 2인 정산
 *   2. 3인 균등 분배
 *   3. 단일 멤버 → 빈 배열
 *   4. 모든 잔액 0 → 빈 배열
 *   5. 소수점 정밀도 (반올림 2자리)
 *   6. 멤버 불균등 — 최소 거래 수 검증
 *   7. 환율 적용 후 정산 금액 일치 확인
 *   8. 재정산 시나리오 — 동일 잔액 배열 두 번 실행 시 결과 일치
 *   9. 미세 잔액(epsilon 이하)은 정산 대상 제외
 *  10. 빈 배열 입력 → 빈 배열 반환
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TravelSettlementService } from '../modules/travel-settlement/travel-settlement.service';

// ─────────────────────────────────────────────────────────────────────────────
// Mock 의존성 — calculateSettlements는 순수 함수이므로 DB/캐시 불필요
// ─────────────────────────────────────────────────────────────────────────────

function buildService(): TravelSettlementService {
  const mockDataSource = {} as any;
  const mockCacheService = {} as any;
  return new TravelSettlementService(mockDataSource, mockCacheService);
}

function member(memberId: string, balance: number, name: string | null = null) {
  return { memberId, name, balance };
}

// ─────────────────────────────────────────────────────────────────────────────
// 헬퍼: 정산 결과의 총액 합산 (채무자 관점)
// ─────────────────────────────────────────────────────────────────────────────

function totalTransferred(
  settlements: Array<{ fromMemberId: string; toMemberId: string; amount: number }>,
  memberId: string,
): { send: number; receive: number } {
  let send = 0;
  let receive = 0;
  for (const s of settlements) {
    if (s.fromMemberId === memberId) send = Number((send + s.amount).toFixed(2));
    if (s.toMemberId === memberId) receive = Number((receive + s.amount).toFixed(2));
  }
  return { send, receive };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: 기본 2인 정산
// ─────────────────────────────────────────────────────────────────────────────

test('calculateSettlements: 2인 — A가 B에게 보내야 할 금액 정확히 계산', () => {
  const service = buildService();
  // A: 40 지불, B: -40 지불 → A가 B에게 40 보내야 함
  const balances = [member('A', -40, 'A'), member('B', 40, 'B')];
  const result = service.calculateSettlements(balances);

  assert.equal(result.length, 1);
  assert.equal(result[0].fromMemberId, 'A');
  assert.equal(result[0].toMemberId, 'B');
  assert.equal(result[0].amount, 40);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: 3인 균등 분배
// ─────────────────────────────────────────────────────────────────────────────

test('calculateSettlements: 3인 균등 분배 — 순 이전 금액이 잔액과 일치', () => {
  const service = buildService();
  // A: +60 (대납), B: -30, C: -30
  const balances = [member('A', 60, 'A'), member('B', -30, 'B'), member('C', -30, 'C')];
  const result = service.calculateSettlements(balances);

  // B와 C 각각 A에게 30씩 송금 → 거래 2건
  assert.equal(result.length, 2);

  const totalA = totalTransferred(result, 'A');
  const totalB = totalTransferred(result, 'B');
  const totalC = totalTransferred(result, 'C');

  assert.equal(totalA.receive, 60);
  assert.equal(totalB.send, 30);
  assert.equal(totalC.send, 30);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: 단일 멤버
// ─────────────────────────────────────────────────────────────────────────────

test('calculateSettlements: 단일 멤버 → 빈 배열 반환', () => {
  const service = buildService();
  const result = service.calculateSettlements([member('A', 100, 'A')]);
  assert.deepEqual(result, []);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: 모든 잔액 0
// ─────────────────────────────────────────────────────────────────────────────

test('calculateSettlements: 모든 잔액 0 → 빈 배열 반환', () => {
  const service = buildService();
  const balances = [
    member('A', 0, 'A'),
    member('B', 0, 'B'),
    member('C', 0, 'C'),
  ];
  const result = service.calculateSettlements(balances);
  assert.deepEqual(result, []);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: 소수점 정밀도 (원화가 아닌 외화 환경에서 발생하는 소수점)
// ─────────────────────────────────────────────────────────────────────────────

test('calculateSettlements: 소수점 금액 — amount가 2자리 반올림으로 정확함', () => {
  const service = buildService();
  // 10 / 3 = 3.3333...  → 정산 시 각 3.33 ~ 3.34 수준
  const balances = [
    member('A', 6.67, 'A'),   // 채권자
    member('B', -3.33, 'B'),  // 채무자
    member('C', -3.34, 'C'),  // 채무자
  ];
  const result = service.calculateSettlements(balances);

  // 모든 amount는 소수점 2자리
  for (const s of result) {
    const decimals = s.amount.toString().split('.')[1]?.length ?? 0;
    assert.ok(decimals <= 2, `amount ${s.amount} has more than 2 decimal places`);
  }

  // A가 받아야 할 총액 = B와 C가 보내야 할 총액
  const receiveA = result.reduce((sum, s) => (s.toMemberId === 'A' ? sum + s.amount : sum), 0);
  const sendBC = result.reduce((sum, s) => (s.fromMemberId !== 'A' ? sum + s.amount : sum), 0);
  assert.ok(Math.abs(receiveA - sendBC) < 0.02, `total mismatch: receiveA=${receiveA} sendBC=${sendBC}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: 불균등 다자간 정산 — 거래 수 최소화 확인
// ─────────────────────────────────────────────────────────────────────────────

test('calculateSettlements: 4인 불균등 — 정산 건수가 멤버 수보다 적거나 같음', () => {
  const service = buildService();
  // A: +100, B: -50, C: -30, D: -20
  const balances = [
    member('A', 100, 'A'),
    member('B', -50, 'B'),
    member('C', -30, 'C'),
    member('D', -20, 'D'),
  ];
  const result = service.calculateSettlements(balances);

  // Greedy 알고리즘에서는 최대 (debtors.length + creditors.length - 1) 건
  assert.ok(result.length <= 3, `Too many settlements: ${result.length}`);

  // 각 채무자 순 이전액이 잔액과 일치
  const totalB = totalTransferred(result, 'B');
  const totalC = totalTransferred(result, 'C');
  const totalD = totalTransferred(result, 'D');

  assert.equal(totalB.send, 50);
  assert.equal(totalC.send, 30);
  assert.equal(totalD.send, 20);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 7: 환율 적용 후 정산 금액 일치 확인
// ─────────────────────────────────────────────────────────────────────────────

test('calculateSettlements: 환율 변환된 convertedAmount 기반 잔액으로 정산 합계 일치', () => {
  const service = buildService();
  // 100 JPY 지출을 KRW로 환산: 1JPY = 8.9KRW → 890 KRW
  // A가 890 KRW 대납, B·C 각 445 KRW 부담
  const balances = [
    member('A', 445, 'A'),  // 890 지불 - 445 부담 = +445
    member('B', -445, 'B'), // 0 지불 - 445 부담 = -445
  ];
  const result = service.calculateSettlements(balances);

  assert.equal(result.length, 1);
  assert.equal(result[0].fromMemberId, 'B');
  assert.equal(result[0].toMemberId, 'A');
  assert.equal(result[0].amount, 445);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 8: 재정산 시나리오 — 동일 잔액 두 번 실행 시 구조 동일 (id 제외)
// ─────────────────────────────────────────────────────────────────────────────

test('calculateSettlements: 동일 잔액으로 두 번 호출해도 from/to/amount 구조 동일', () => {
  const service = buildService();
  const balances = [
    member('A', 100, 'A'),
    member('B', -60, 'B'),
    member('C', -40, 'C'),
  ];

  const first = service.calculateSettlements(balances);
  const second = service.calculateSettlements(balances);

  assert.equal(first.length, second.length);

  for (let i = 0; i < first.length; i++) {
    assert.equal(first[i].fromMemberId, second[i].fromMemberId);
    assert.equal(first[i].toMemberId, second[i].toMemberId);
    assert.equal(first[i].amount, second[i].amount);
    // id는 UUID이므로 매번 달라야 함
    assert.notEqual(first[i].id, second[i].id);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 9: 미세 잔액(0.01 이하)은 정산 제외
// ─────────────────────────────────────────────────────────────────────────────

test('calculateSettlements: 0.01 이하 미세 잔액은 정산 대상에서 제외', () => {
  const service = buildService();
  // 부동소수점 오차 수준 잔액
  const balances = [
    member('A', 0.005, 'A'),
    member('B', -0.005, 'B'),
  ];
  const result = service.calculateSettlements(balances);
  assert.equal(result.length, 0, 'Epsilon-level balance should produce no settlement');
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 10: 빈 배열 입력
// ─────────────────────────────────────────────────────────────────────────────

test('calculateSettlements: 빈 배열 입력 → 빈 배열 반환', () => {
  const service = buildService();
  const result = service.calculateSettlements([]);
  assert.deepEqual(result, []);
});
