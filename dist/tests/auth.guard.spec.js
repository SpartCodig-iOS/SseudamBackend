"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../common/guards/auth.guard");
// ─────────────────────────────────────────────────────────────────────────────
// Mock 헬퍼
// ─────────────────────────────────────────────────────────────────────────────
function buildMockEnhancedJwtService(overrides = {}) {
    return {
        verifyAccessToken: overrides.verifyAccessToken ??
            (async (_token) => null),
        decodeToken: (_token) => null,
    };
}
function buildMockSupabaseService(overrides = {}) {
    return {
        getUserFromToken: overrides.getUserFromToken ??
            (async (_token) => null),
    };
}
function buildMockCacheService() {
    const store = new Map();
    return {
        get: async (key) => store.get(key) ?? null,
        set: async (key, value) => {
            store.set(key, value);
        },
    };
}
function buildMockContext(authHeader) {
    const request = {};
    if (authHeader !== undefined) {
        request['headers'] = { authorization: authHeader };
    }
    else {
        request['headers'] = {};
    }
    return {
        switchToHttp: () => ({
            getRequest: () => request,
        }),
    };
}
const VALID_JWT_PAYLOAD = {
    sub: 'user-id-123',
    email: 'user@example.com',
    name: '홍길동',
    role: 'user',
    loginType: 'email',
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
(0, node_test_1.default)('AuthGuard: Authorization 헤더 없으면 UnauthorizedException 발생', async () => {
    const guard = new auth_guard_1.AuthGuard(buildMockEnhancedJwtService(), buildMockSupabaseService(), buildMockCacheService());
    const ctx = buildMockContext(undefined);
    await strict_1.default.rejects(() => guard.canActivate(ctx), (err) => {
        strict_1.default.ok(err instanceof common_1.UnauthorizedException);
        return true;
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// 2. Enhanced JWT 검증 성공
// ─────────────────────────────────────────────────────────────────────────────
(0, node_test_1.default)('AuthGuard: 유효한 Enhanced JWT 토큰 → currentUser 설정 후 true 반환', async () => {
    const guard = new auth_guard_1.AuthGuard(buildMockEnhancedJwtService({
        verifyAccessToken: async (_token) => VALID_JWT_PAYLOAD,
    }), buildMockSupabaseService(), buildMockCacheService());
    const ctx = buildMockContext('Bearer valid-token-here');
    const result = await guard.canActivate(ctx);
    strict_1.default.strictEqual(result, true);
    const request = ctx.switchToHttp().getRequest();
    strict_1.default.ok(request.currentUser, 'currentUser should be set');
    strict_1.default.strictEqual(request.currentUser.id, VALID_JWT_PAYLOAD.sub);
    strict_1.default.strictEqual(request.currentUser.email, VALID_JWT_PAYLOAD.email);
    strict_1.default.strictEqual(request.loginType, VALID_JWT_PAYLOAD.loginType);
});
// ─────────────────────────────────────────────────────────────────────────────
// 3. Enhanced JWT 실패(blacklist 등) → Supabase fallback → Supabase도 null
// ─────────────────────────────────────────────────────────────────────────────
(0, node_test_1.default)('AuthGuard: Enhanced JWT 실패 + Supabase도 null → UnauthorizedException', async () => {
    const guard = new auth_guard_1.AuthGuard(buildMockEnhancedJwtService({
        verifyAccessToken: async () => { throw new Error('blacklisted'); },
    }), buildMockSupabaseService({
        getUserFromToken: async () => null,
    }), buildMockCacheService());
    const ctx = buildMockContext('Bearer blacklisted-token');
    await strict_1.default.rejects(() => guard.canActivate(ctx), (err) => {
        strict_1.default.ok(err instanceof common_1.UnauthorizedException);
        return true;
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// 4. Supabase 토큰 검증 성공 (Enhanced JWT 미발급 토큰)
// ─────────────────────────────────────────────────────────────────────────────
(0, node_test_1.default)('AuthGuard: Enhanced JWT 실패 후 Supabase 검증 성공 → currentUser 설정 + true 반환', async () => {
    // DB pool 호출을 피하기 위해 hydrateUserRole을 spy해야 하지만,
    // AuthGuard의 private 메서드는 직접 호출 불가능하다.
    // DB pool이 없는 테스트 환경에서 hydrateUserRole 내부의 getPool()은 실패하므로
    // try/catch 분기에서 fallback role을 사용하는 경로를 검증한다.
    const guard = new auth_guard_1.AuthGuard(buildMockEnhancedJwtService({
        verifyAccessToken: async () => null, // JWT 검증 실패
    }), buildMockSupabaseService({
        getUserFromToken: async () => VALID_SUPABASE_USER,
    }), buildMockCacheService());
    const ctx = buildMockContext('Bearer supabase-token');
    const result = await guard.canActivate(ctx);
    strict_1.default.strictEqual(result, true);
    const request = ctx.switchToHttp().getRequest();
    strict_1.default.ok(request.currentUser, 'currentUser should be set');
    strict_1.default.strictEqual(request.currentUser.email, VALID_SUPABASE_USER.email);
    strict_1.default.strictEqual(request.loginType, 'email');
});
// ─────────────────────────────────────────────────────────────────────────────
// 5. 잘못된 Authorization 헤더 형식
// ─────────────────────────────────────────────────────────────────────────────
(0, node_test_1.default)('AuthGuard: "Basic xxx" 형식 헤더 → UnauthorizedException (Bearer 아님)', async () => {
    const guard = new auth_guard_1.AuthGuard(buildMockEnhancedJwtService(), buildMockSupabaseService(), buildMockCacheService());
    const ctx = buildMockContext('Basic dXNlcjpwYXNz');
    await strict_1.default.rejects(() => guard.canActivate(ctx), (err) => {
        strict_1.default.ok(err instanceof common_1.UnauthorizedException);
        return true;
    });
});
(0, node_test_1.default)('AuthGuard: "Bearer " (토큰 없음) 형식 헤더 → UnauthorizedException', async () => {
    const guard = new auth_guard_1.AuthGuard(buildMockEnhancedJwtService(), buildMockSupabaseService(), buildMockCacheService());
    const ctx = buildMockContext('Bearer ');
    await strict_1.default.rejects(() => guard.canActivate(ctx), (err) => {
        strict_1.default.ok(err instanceof common_1.UnauthorizedException);
        return true;
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// 6. Enhanced JWT + Supabase 모두 예외 → UnauthorizedException
// ─────────────────────────────────────────────────────────────────────────────
(0, node_test_1.default)('AuthGuard: Enhanced JWT throw + Supabase throw → UnauthorizedException', async () => {
    const guard = new auth_guard_1.AuthGuard(buildMockEnhancedJwtService({
        verifyAccessToken: async () => { throw new Error('jwt error'); },
    }), buildMockSupabaseService({
        getUserFromToken: async () => { throw new Error('supabase error'); },
    }), buildMockCacheService());
    const ctx = buildMockContext('Bearer some-token');
    await strict_1.default.rejects(() => guard.canActivate(ctx), (err) => {
        strict_1.default.ok(err instanceof common_1.UnauthorizedException);
        return true;
    });
});
// ─────────────────────────────────────────────────────────────────────────────
// 7. 배열 형식 Authorization 헤더
// ─────────────────────────────────────────────────────────────────────────────
(0, node_test_1.default)('AuthGuard: 배열 Authorization 헤더 → 첫 번째 값을 Bearer 토큰으로 처리', async () => {
    const guard = new auth_guard_1.AuthGuard(buildMockEnhancedJwtService({
        verifyAccessToken: async (_token) => VALID_JWT_PAYLOAD,
    }), buildMockSupabaseService(), buildMockCacheService());
    // 배열로 전달
    const ctx = buildMockContext(['Bearer array-token', 'Bearer second-token']);
    const result = await guard.canActivate(ctx);
    strict_1.default.strictEqual(result, true);
    const request = ctx.switchToHttp().getRequest();
    strict_1.default.ok(request.currentUser);
    strict_1.default.strictEqual(request.currentUser.id, VALID_JWT_PAYLOAD.sub);
});
