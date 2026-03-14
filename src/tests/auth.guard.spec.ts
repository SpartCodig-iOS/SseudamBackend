/**
 * AuthGuard 단위 테스트
 *
 * 테스트 대상:
 *   1. Bearer 토큰 미제공 → UnauthorizedException
 *   2. Enhanced JWT 검증 성공 → currentUser 주입 + true 반환
 *   3. Blacklist에 있는 토큰 → Supabase fallback 시도
 *   4. Supabase 토큰 검증 성공 → currentUser 주입 + true 반환
 *   5. 잘못된 Authorization 헤더 형식 → UnauthorizedException
 *   6. Enhanced JWT + Supabase 모두 실패 → UnauthorizedException
 *   7. 배열 형식 Authorization 헤더 → 첫 번째 값 사용
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import type { ExecutionContext } from '@nestjs/common';

// ─────────────────────────────────────────────────────────────────────────────
// Mock 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

function buildMockJwtTokenService() {
  return {
    verifyAccessToken: async (_token: string) => null,
    decodeToken: (_token: string) => null,
  } as any;
}

function buildMockEnhancedJwtService(
  overrides: {
    verifyAccessToken?: (token: string) => Promise<any>;
  } = {},
) {
  return {
    verifyAccessToken:
      overrides.verifyAccessToken ??
      (async (_token: string) => null),
    decodeToken: (_token: string) => null,
  } as any;
}

function buildMockSessionService() {
  return {
    validateSession: async (_sessionId: string) => null,
    createSession: async (_userId: string) => 'mock-session-id',
  } as any;
}

function buildMockSupabaseService(
  overrides: {
    getUserFromToken?: (token: string) => Promise<any>;
  } = {},
) {
  return {
    getUserFromToken:
      overrides.getUserFromToken ??
      (async (_token: string): Promise<any> => null),
  } as any;
}

function buildMockCacheService() {
  const store = new Map<string, unknown>();
  return {
    get: async <T>(key: string): Promise<T | null> =>
      (store.get(key) as T | undefined) ?? null,
    set: async (key: string, value: unknown) => {
      store.set(key, value);
    },
  } as any;
}

function buildMockContext(authHeader?: string | string[]) {
  const request: Record<string, unknown> = {};
  if (authHeader !== undefined) {
    request['headers'] = { authorization: authHeader };
  } else {
    request['headers'] = {};
  }
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

const VALID_JWT_PAYLOAD = {
  sub: 'user-id-123',
  email: 'user@example.com',
  name: '홍길동',
  role: 'user',
  loginType: 'email' as const,
  sessionId: 'session-abc',
  tokenId: 'token-xyz',
  iat: Math.floor(Date.now() / 1000) - 60,
  exp: Math.floor(Date.now() / 1000) + 3600,
  iss: 'sseudam-backend',
  aud: 'sseudam-app',
};

const VALID_SUPABASE_USER = {
  id: 'supabase-user-id',
  email: 'supabase@example.com',
  user_metadata: { name: '김철수' },
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Bearer 토큰 미제공
// ─────────────────────────────────────────────────────────────────────────────

test('AuthGuard: Authorization 헤더 없으면 UnauthorizedException 발생', async () => {
  const guard = new AuthGuard(
    buildMockJwtTokenService(),
    buildMockEnhancedJwtService(),
    buildMockSupabaseService(),
    buildMockSessionService(),
    buildMockCacheService(),
  );
  const ctx = buildMockContext(undefined);

  await assert.rejects(
    () => guard.canActivate(ctx),
    (err) => {
      assert.ok(err instanceof UnauthorizedException);
      return true;
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Enhanced JWT 검증 성공
// ─────────────────────────────────────────────────────────────────────────────

test('AuthGuard: 유효한 Enhanced JWT 토큰 → currentUser 설정 후 true 반환', async () => {
  const guard = new AuthGuard(
    buildMockJwtTokenService(),
    buildMockEnhancedJwtService({
      verifyAccessToken: async (_token) => VALID_JWT_PAYLOAD,
    }),
    buildMockSupabaseService(),
    buildMockSessionService(),
    buildMockCacheService(),
  );

  const ctx = buildMockContext('Bearer valid-token-here');
  const result = await guard.canActivate(ctx);
  assert.strictEqual(result, true);

  const request = ctx.switchToHttp().getRequest() as any;
  assert.ok(request.currentUser, 'currentUser should be set');
  assert.strictEqual(request.currentUser.id, VALID_JWT_PAYLOAD.sub);
  assert.strictEqual(request.currentUser.email, VALID_JWT_PAYLOAD.email);
  assert.strictEqual(request.loginType, VALID_JWT_PAYLOAD.loginType);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Enhanced JWT 실패(blacklist 등) → Supabase fallback → Supabase도 null
// ─────────────────────────────────────────────────────────────────────────────

test('AuthGuard: Enhanced JWT 실패 + Supabase도 null → UnauthorizedException', async () => {
  const guard = new AuthGuard(
    buildMockJwtTokenService(),
    buildMockEnhancedJwtService({
      verifyAccessToken: async () => { throw new Error('blacklisted'); },
    }),
    buildMockSupabaseService({
      getUserFromToken: async () => null,
    }),
    buildMockSessionService(),
    buildMockCacheService(),
  );

  const ctx = buildMockContext('Bearer blacklisted-token');
  await assert.rejects(
    () => guard.canActivate(ctx),
    (err) => {
      assert.ok(err instanceof UnauthorizedException);
      return true;
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Supabase 토큰 검증 성공 (Enhanced JWT 미발급 토큰)
// ─────────────────────────────────────────────────────────────────────────────

test('AuthGuard: Enhanced JWT 실패 후 Supabase 검증 성공 → currentUser 설정 + true 반환', async () => {
  // DB pool 호출을 피하기 위해 hydrateUserRole을 spy해야 하지만,
  // AuthGuard의 private 메서드는 직접 호출 불가능하다.
  // DB pool이 없는 테스트 환경에서 hydrateUserRole 내부의 getPool()은 실패하므로
  // try/catch 분기에서 fallback role을 사용하는 경로를 검증한다.
  const guard = new AuthGuard(
    buildMockJwtTokenService(),
    buildMockEnhancedJwtService({
      verifyAccessToken: async () => null, // JWT 검증 실패
    }),
    buildMockSupabaseService({
      getUserFromToken: async () => VALID_SUPABASE_USER,
    }),
    buildMockSessionService(),
    buildMockCacheService(),
  );

  const ctx = buildMockContext('Bearer supabase-token');
  const result = await guard.canActivate(ctx);
  assert.strictEqual(result, true);

  const request = ctx.switchToHttp().getRequest() as any;
  assert.ok(request.currentUser, 'currentUser should be set');
  assert.strictEqual(request.currentUser.email, VALID_SUPABASE_USER.email);
  assert.strictEqual(request.loginType, 'email');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. 잘못된 Authorization 헤더 형식
// ─────────────────────────────────────────────────────────────────────────────

test('AuthGuard: "Basic xxx" 형식 헤더 → UnauthorizedException (Bearer 아님)', async () => {
  const guard = new AuthGuard(
    buildMockJwtTokenService(),
    buildMockEnhancedJwtService(),
    buildMockSupabaseService(),
    buildMockSessionService(),
    buildMockCacheService(),
  );
  const ctx = buildMockContext('Basic dXNlcjpwYXNz');
  await assert.rejects(
    () => guard.canActivate(ctx),
    (err) => {
      assert.ok(err instanceof UnauthorizedException);
      return true;
    },
  );
});

test('AuthGuard: "Bearer " (토큰 없음) 형식 헤더 → UnauthorizedException', async () => {
  const guard = new AuthGuard(
    buildMockJwtTokenService(),
    buildMockEnhancedJwtService(),
    buildMockSupabaseService(),
    buildMockSessionService(),
    buildMockCacheService(),
  );
  const ctx = buildMockContext('Bearer ');
  await assert.rejects(
    () => guard.canActivate(ctx),
    (err) => {
      assert.ok(err instanceof UnauthorizedException);
      return true;
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Enhanced JWT + Supabase 모두 예외 → UnauthorizedException
// ─────────────────────────────────────────────────────────────────────────────

test('AuthGuard: Enhanced JWT throw + Supabase throw → UnauthorizedException', async () => {
  const guard = new AuthGuard(
    buildMockJwtTokenService(),
    buildMockEnhancedJwtService({
      verifyAccessToken: async () => { throw new Error('jwt error'); },
    }),
    buildMockSupabaseService({
      getUserFromToken: async () => { throw new Error('supabase error'); },
    }),
    buildMockSessionService(),
    buildMockCacheService(),
  );
  const ctx = buildMockContext('Bearer some-token');
  await assert.rejects(
    () => guard.canActivate(ctx),
    (err) => {
      assert.ok(err instanceof UnauthorizedException);
      return true;
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. 배열 형식 Authorization 헤더
// ─────────────────────────────────────────────────────────────────────────────

test('AuthGuard: 배열 Authorization 헤더 → 첫 번째 값을 Bearer 토큰으로 처리', async () => {
  const guard = new AuthGuard(
    buildMockJwtTokenService(),
    buildMockEnhancedJwtService({
      verifyAccessToken: async (_token) => VALID_JWT_PAYLOAD,
    }),
    buildMockSupabaseService(),
    buildMockSessionService(),
    buildMockCacheService(),
  );
  // 배열로 전달
  const ctx = buildMockContext(['Bearer array-token', 'Bearer second-token']);
  const result = await guard.canActivate(ctx);
  assert.strictEqual(result, true);

  const request = ctx.switchToHttp().getRequest() as any;
  assert.ok(request.currentUser);
  assert.strictEqual(request.currentUser.id, VALID_JWT_PAYLOAD.sub);
});
