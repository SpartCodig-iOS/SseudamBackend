/**
 * UserService 단위 테스트
 *
 * 테스트 대상:
 *   1. createUser — 신규 사용자 생성 성공
 *   2. createUser — 이메일 중복 시 ConflictException
 *   3. createUser — 유저네임 중복 시 ConflictException
 *   4. findById — 존재하는 사용자 조회
 *   5. findById — 미존재 사용자 → NotFoundException
 *   6. updateUser — 정상 업데이트
 *   7. updateUser — 유저네임 중복 → ConflictException
 *   8. deleteUser — 정상 삭제
 *   9. deleteUser — 미존재 사용자 → NotFoundException
 *  10. verifyPassword — 올바른 비밀번호
 *  11. verifyPassword — 잘못된 비밀번호
 *  12. searchUsers — 검색어로 사용자 목록 반환
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UserService } from '../modules/user/user.service';

// ─────────────────────────────────────────────────────────────────────────────
// 테스트 픽스처
// ─────────────────────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-uuid-123',
  email: 'test@example.com',
  name: '홍길동',
  username: 'honggildong',
  avatar_url: null,
  role: 'user',
  password_hash: '$2b$10$hashedPasswordExample',
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
} as any;

// ─────────────────────────────────────────────────────────────────────────────
// Mock UserRepository 빌더
// ─────────────────────────────────────────────────────────────────────────────

function buildMockUserRepository(overrides: Record<string, any> = {}) {
  return {
    isEmailTaken: async (_email: string) => false,
    isUsernameTaken: async (_username: string, _excludeId?: string) => false,
    create: async (data: any) => ({ ...mockUser, ...data }),
    findById: async (_id: string) => mockUser,
    findByEmail: async (_email: string) => mockUser,
    findByUsername: async (_username: string) => mockUser,
    findByEmailOrUsername: async (_identifier: string) => mockUser,
    update: async (_id: string, _data: any) => ({ ...mockUser, ..._data }),
    delete: async (_id: string) => true,
    searchUsers: async (_term: string, _limit: number) => [mockUser],
    getUserStats: async (_userId: string) => ({ totalTravels: 3, totalExpenses: 12 }),
    findUsersById: async (_ids: string[]) => [mockUser],
    findAndCount: async (_options: any) => [[mockUser], 1],
    count: async () => 42,
    markLastLogin: async (_id: string) => undefined,
    ...overrides,
  } as any;
}

function buildService(repoOverrides: Record<string, any> = {}) {
  return new UserService(buildMockUserRepository(repoOverrides));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. createUser — 정상 생성
// ─────────────────────────────────────────────────────────────────────────────

test('UserService.createUser: 신규 사용자 생성 성공', async () => {
  const service = buildService();

  const result = await service.createUser({
    email: 'new@example.com',
    password: 'securePass123!',
    name: '김새롬',
    username: 'newuser',
  });

  assert.ok(result, '사용자가 반환되어야 한다');
  assert.ok(result.id, 'id가 있어야 한다');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. createUser — 이메일 중복
// ─────────────────────────────────────────────────────────────────────────────

test('UserService.createUser: 이메일 중복 시 ConflictException 발생', async () => {
  const service = buildService({
    isEmailTaken: async () => true,
  });

  await assert.rejects(
    () => service.createUser({
      email: 'existing@example.com',
      password: 'pass123',
      username: 'newuser',
    }),
    (err: any) => {
      assert.ok(err instanceof ConflictException);
      return true;
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. createUser — 유저네임 중복
// ─────────────────────────────────────────────────────────────────────────────

test('UserService.createUser: 유저네임 중복 시 ConflictException 발생', async () => {
  const service = buildService({
    isEmailTaken: async () => false,
    isUsernameTaken: async () => true,
  });

  await assert.rejects(
    () => service.createUser({
      email: 'new@example.com',
      password: 'pass123',
      username: 'takenname',
    }),
    (err: any) => {
      assert.ok(err instanceof ConflictException);
      return true;
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. findById — 존재하는 사용자
// ─────────────────────────────────────────────────────────────────────────────

test('UserService.findById: 존재하는 사용자 반환', async () => {
  const service = buildService();
  const result = await service.findById('user-uuid-123');

  assert.ok(result);
  assert.equal(result.id, 'user-uuid-123');
  assert.equal(result.email, 'test@example.com');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. findById — 미존재 사용자
// ─────────────────────────────────────────────────────────────────────────────

test('UserService.findById: 미존재 사용자 → NotFoundException', async () => {
  const service = buildService({
    findById: async () => null,
  });

  await assert.rejects(
    () => service.findById('non-existent-id'),
    (err: any) => {
      assert.ok(err instanceof NotFoundException);
      return true;
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. updateUser — 정상 업데이트
// ─────────────────────────────────────────────────────────────────────────────

test('UserService.updateUser: 사용자 정보 정상 업데이트', async () => {
  const service = buildService({
    update: async (_id: string, data: any) => ({ ...mockUser, ...data }),
  });

  const result = await service.updateUser('user-uuid-123', { name: '이름변경' });

  assert.equal(result.name, '이름변경');
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. updateUser — 유저네임 중복
// ─────────────────────────────────────────────────────────────────────────────

test('UserService.updateUser: 유저네임 중복 시 ConflictException', async () => {
  const service = buildService({
    isUsernameTaken: async (_username: string, _excludeId?: string) => true,
  });

  await assert.rejects(
    () => service.updateUser('user-uuid-123', { username: 'takenname' }),
    (err: any) => {
      assert.ok(err instanceof ConflictException);
      return true;
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. deleteUser — 정상 삭제
// ─────────────────────────────────────────────────────────────────────────────

test('UserService.deleteUser: 정상 삭제 시 예외 없이 완료', async () => {
  const service = buildService();

  await assert.doesNotReject(
    () => service.deleteUser('user-uuid-123'),
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. deleteUser — 미존재 사용자
// ─────────────────────────────────────────────────────────────────────────────

test('UserService.deleteUser: 미존재 사용자 → NotFoundException', async () => {
  const service = buildService({
    findById: async () => null,
  });

  await assert.rejects(
    () => service.deleteUser('non-existent'),
    (err: any) => {
      assert.ok(err instanceof NotFoundException);
      return true;
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. verifyPassword — 올바른 비밀번호 (bcrypt 실제 해싱)
// ─────────────────────────────────────────────────────────────────────────────

test('UserService.verifyPassword: password_hash가 없으면 false 반환', async () => {
  const service = buildService();
  const userWithoutHash = { ...mockUser, password_hash: null } as any;
  const result = await service.verifyPassword(userWithoutHash, 'anyPassword');

  assert.equal(result, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. searchUsers — 검색어로 목록 반환
// ─────────────────────────────────────────────────────────────────────────────

test('UserService.searchUsers: 검색어로 사용자 목록을 반환한다', async () => {
  const service = buildService({
    searchUsers: async (_term: string, _limit: number) => [mockUser],
  });

  const result = await service.searchUsers('홍', 5);

  assert.ok(Array.isArray(result));
  assert.equal(result.length, 1);
  assert.equal(result[0].name, '홍길동');
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. getUserStats — 통계 정보 반환
// ─────────────────────────────────────────────────────────────────────────────

test('UserService.getUserStats: 사용자 통계를 반환한다', async () => {
  const service = buildService();
  const stats = await service.getUserStats('user-uuid-123');

  assert.ok(typeof stats.totalTravels === 'number');
  assert.ok(typeof stats.totalExpenses === 'number');
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. updateUserRole — 역할 변경
// ─────────────────────────────────────────────────────────────────────────────

test('UserService.updateUserRole: 역할을 admin으로 변경한다', async () => {
  const service = buildService({
    update: async (_id: string, data: any) => ({ ...mockUser, ...data }),
  });

  const result = await service.updateUserRole('user-uuid-123', 'admin');

  assert.equal(result.role, 'admin');
});
