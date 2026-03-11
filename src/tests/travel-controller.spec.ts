/**
 * TravelController 단위 테스트
 *
 * 컨트롤러의 라우팅·가드 위임 및 서비스 호출 위임을 검증합니다.
 * TravelService는 완전한 Mock으로 대체합니다.
 *
 * 테스트 대상 엔드포인트:
 *   1. GET  /api/v1/travels         → list (인증 없음 → UnauthorizedException)
 *   2. GET  /api/v1/travels         → list (정상)
 *   3. POST /api/v1/travels         → create (정상)
 *   4. POST /api/v1/travels         → create (인증 없음 → UnauthorizedException)
 *   5. DELETE /api/v1/travels/:id   → deleteTravel (정상)
 *   6. POST /api/v1/travels/join    → joinByInviteCode (정상)
 *   7. DELETE /:travelId/leave      → leaveTravel (정상)
 *   8. PATCH /:travelId/owner       → transferOwnership (정상)
 *   9. GET /:travelId/members       → getTravelMembersByTravelId (정상)
 *  10. DELETE /:travelId/members/:memberId → removeMember (정상)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { UnauthorizedException } from '@nestjs/common';
import { TravelController } from '../modules/travel/travel.controller';

// ─────────────────────────────────────────────────────────────────────────────
// 픽스처
// ─────────────────────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-abc',
  email: 'user@example.com',
  name: '홍길동',
  role: 'user',
};

const mockTravel = {
  id: 'travel-xyz',
  title: '도쿄 여행',
  startDate: '2025-11-01',
  endDate: '2025-11-05',
  countryCode: 'JP',
  baseCurrency: 'KRW',
  baseExchangeRate: 9.5,
  status: 'active',
  members: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Mock 서비스 빌더
// ─────────────────────────────────────────────────────────────────────────────

function buildMockTravelService(overrides: Record<string, any> = {}) {
  return {
    listTravels: async () => ({ items: [mockTravel], total: 1, page: 1, limit: 20 }),
    createTravel: async () => mockTravel,
    updateTravel: async () => mockTravel,
    getTravelDetail: async () => mockTravel,
    getTravelMembersByTravelId: async () => ({ members: [], currentUser: null }),
    removeMember: async () => undefined,
    createInvite: async () => ({ inviteCode: 'abc123', deepLink: 'https://example.com/abc123' }),
    joinByInviteCode: async () => mockTravel,
    deleteTravel: async () => undefined,
    leaveTravel: async () => ({ deletedTravel: false }),
    transferOwnership: async () => mockTravel,
    ...overrides,
  } as any;
}

function buildMockOptimizedTravelService(overrides: Record<string, any> = {}) {
  return {
    listTravelsOptimized: async () => ({ items: [mockTravel], total: 1, page: 1, limit: 20 }),
    ...overrides,
  } as any;
}

function buildRequest(user: any, query: Record<string, string> = {}) {
  return {
    currentUser: user,
    query,
    headers: {},
  } as any;
}

function buildController(serviceOverrides: Record<string, any> = {}) {
  return new TravelController(
    buildMockTravelService(serviceOverrides),
    buildMockOptimizedTravelService(),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. list — 인증 없음 → UnauthorizedException
// ─────────────────────────────────────────────────────────────────────────────

test('TravelController.list: currentUser 없음 → UnauthorizedException', async () => {
  const controller = buildController();
  const req = buildRequest(null);

  await assert.rejects(
    () => controller.list(req, req),
    (err: any) => {
      assert.ok(err instanceof UnauthorizedException);
      return true;
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. list — 정상 조회 (optimized service 위임)
// ─────────────────────────────────────────────────────────────────────────────

test('TravelController.list: 인증된 사용자 → 여행 목록 반환', async () => {
  const controller = buildController();
  const req = buildRequest(mockUser, { page: '1', limit: '10' });

  const result = await controller.list(req, req);

  assert.ok(result, '결과가 있어야 한다');
  assert.ok((result as any).data, 'data 필드가 있어야 한다');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. create — 정상 생성
// ─────────────────────────────────────────────────────────────────────────────

test('TravelController.create: 유효한 body → 여행 생성 반환', async () => {
  const controller = buildController();
  const req = buildRequest(mockUser);

  const body = {
    title: '도쿄 가을 여행',
    startDate: '2025-10-01',
    endDate: '2025-10-07',
    countryCode: 'JP',
    countryNameKr: '일본',
    baseCurrency: 'KRW',
    baseExchangeRate: 9.5,
    countryCurrencies: ['JPY'],
  };

  const result = await controller.create(body, req);

  assert.ok(result, '결과가 있어야 한다');
  assert.ok((result as any).data, 'data 필드가 있어야 한다');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. create — 인증 없음 → UnauthorizedException
// ─────────────────────────────────────────────────────────────────────────────

test('TravelController.create: currentUser 없음 → UnauthorizedException', async () => {
  const controller = buildController();
  const req = buildRequest(null);

  await assert.rejects(
    () => controller.create({}, req),
    (err: any) => {
      assert.ok(err instanceof UnauthorizedException);
      return true;
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. deleteTravel — 정상 삭제
// ─────────────────────────────────────────────────────────────────────────────

test('TravelController.deleteTravel: 인증된 사용자 → 정상 삭제', async () => {
  const controller = buildController();
  const req = buildRequest(mockUser);

  const result = await controller.deleteTravel('a0b1c2d3-e4f5-4061-a7b8-c9d0e1f2a3b4', req);

  assert.ok(result, '결과가 있어야 한다');
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. join — 초대 코드로 여행 참여
// ─────────────────────────────────────────────────────────────────────────────

test('TravelController.join: 유효한 초대코드 → 여행 참여 성공', async () => {
  const controller = buildController();
  const req = buildRequest(mockUser);

  const result = await controller.join({ inviteCode: 'abc12345' }, req);

  assert.ok(result, '결과가 있어야 한다');
  assert.ok((result as any).data, 'data 필드가 있어야 한다');
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. leaveTravel — 여행 나가기
// ─────────────────────────────────────────────────────────────────────────────

test('TravelController.leaveTravel: 인증된 사용자 → 여행 나가기 성공', async () => {
  const controller = buildController();
  const req = buildRequest(mockUser);

  const result = await controller.leaveTravel('a0b1c2d3-e4f5-4061-a7b8-c9d0e1f2a3b4', req);

  assert.ok(result);
  assert.equal((result as any).code, 200);
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. transferOwnership — 호스트 권한 위임
// ─────────────────────────────────────────────────────────────────────────────

test('TravelController.transferOwnership: 인증된 사용자 → 권한 위임 성공', async () => {
  const controller = buildController();
  const req = buildRequest(mockUser);

  const body = { newOwnerId: 'e0f1a2b3-c4d5-4678-a9f0-a1b2c3d4e5f6' };
  const result = await controller.transferOwnership(
    'a0b1c2d3-e4f5-4061-a7b8-c9d0e1f2a3b4',
    body,
    req,
  );

  assert.ok(result);
  assert.ok((result as any).data);
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. getTravelMembersByTravelId — 멤버 목록 조회
// ─────────────────────────────────────────────────────────────────────────────

test('TravelController.getTravelMembersByTravelId: 인증된 사용자 → 멤버 목록 반환', async () => {
  const controller = buildController({
    getTravelMembersByTravelId: async () => ({
      currentUser: { userId: mockUser.id, name: mockUser.name, role: 'owner' },
      members: [],
    }),
  });
  const req = buildRequest(mockUser);

  const result = await controller.getTravelMembersByTravelId(
    'a0b1c2d3-e4f5-4061-a7b8-c9d0e1f2a3b4',
    req,
  );

  assert.ok(result);
  assert.equal((result as any).code, 200);
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. removeMember — 멤버 삭제
// ─────────────────────────────────────────────────────────────────────────────

test('TravelController.removeMember: 호스트 → 멤버 삭제 성공', async () => {
  const controller = buildController();
  const req = buildRequest(mockUser);

  const result = await controller.removeMember(
    'a0b1c2d3-e4f5-4061-a7b8-c9d0e1f2a3b4',
    'b1c2d3e4-f5a6-4789-b0c1-d2e3f4a5b6c7',
    req,
  );

  assert.ok(result);
  assert.equal((result as any).code, 200);
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. createInvite — 초대 코드 생성
// ─────────────────────────────────────────────────────────────────────────────

test('TravelController.createInvite: 인증된 사용자 → 초대 코드 생성 성공', async () => {
  const controller = buildController();
  const req = buildRequest(mockUser);

  const result = await controller.createInvite(
    'a0b1c2d3-e4f5-4061-a7b8-c9d0e1f2a3b4',
    req,
  );

  assert.ok(result);
  assert.ok((result as any).data.inviteCode, '초대 코드가 있어야 한다');
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. list — status 필터 유효성 검증
// ─────────────────────────────────────────────────────────────────────────────

test('TravelController.list: 유효하지 않은 status 값 → BadRequestException', async () => {
  const { BadRequestException } = await import('@nestjs/common');
  const controller = buildController();
  const req = buildRequest(mockUser, { status: 'invalid_status' });

  await assert.rejects(
    () => controller.list(req, req),
    (err: any) => {
      assert.ok(err instanceof BadRequestException);
      return true;
    },
  );
});
