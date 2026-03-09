# 🚨 긴급 보안 수정 사항

## 1. 무한 토큰 엔드포인트 비활성화 (Critical)

**현재 문제:**
- `POST /api/v1/dev/infinite-token` 엔드포인트가 프로덕션에서 활성화됨
- 누구나 `{"id": "test", "password": "test123!"}` 요청으로 무한 유효한 JWT 토큰 생성 가능

**즉시 수정:**
```typescript
// src/modules/dev/dev.controller.ts
async generateInfiniteToken(@Body() body: { id: string; password: string }) {
  // 즉시 복구 필요
  if (env.nodeEnv !== 'development') {
    throw new ForbiddenException('This endpoint is only available in development environment');
  }
  // 나머지 코드...
}
```

## 2. bcrypt 캐시 제거 (Critical)

**현재 문제:**
- `AuthService`에서 비밀번호 검증 결과를 캐시
- 평문 비밀번호가 메모리에 저장됨
- 같은 첫 8글자 비밀번호가 동일하게 처리됨

**즉시 수정:**
```typescript
// src/modules/auth/auth.service.ts - 전체 bcrypt 캐시 로직 삭제
// 라인 115-143, 200, 281-288 제거

// 대신 직접 bcrypt.compare() 사용
const isValidPassword = await bcrypt.compare(password, row.password_hash);
```

## 3. 하드코딩된 사용자 ID 제거 (Critical)

**현재 문제:**
```typescript
// src/common/guards/auth.guard.ts
if (!dbRole && user.id === 'e11cc73b-052d-4740-8213-999c05bfc332') {
  // 자동으로 프로필 생성...
}
```

**즉시 수정:**
```typescript
// 이 전체 블록 삭제 또는 적절한 관리자 인증으로 대체
```

## 4. JWT 비밀키 기본값 수정 (Critical)

**현재 문제:**
```typescript
jwtSecret: process.env.JWT_SECRET ?? 'secret',
```

**수정:**
```typescript
jwtSecret: process.env.JWT_SECRET || (() => {
  if (env.nodeEnv === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }
  return 'development-only-secret-' + Date.now();
})(),
```

## 5. 세션 검증 복구 (High)

**현재 문제:**
- JWT 인증 시 세션 유효성 검사를 건너뛰어 로그아웃한 토큰도 유효함

**수정:**
```typescript
// src/common/guards/auth.guard.ts
async tryLocalJwt(token: string, request: any): Promise<boolean> {
  try {
    const payload = this.jwtTokenService.verifyAccessToken(token);

    // 세션 검증 추가
    const sessionValid = await this.ensureSessionActive(payload.sessionId);
    if (!sessionValid) {
      return false;
    }

    // 나머지 로직...
  } catch (error) {
    return false;
  }
}
```

## 6. 디버그 로그 제거 (Medium)

**제거해야 할 로그들:**
```typescript
// src/config/env.ts - 라인 8-14 제거
console.log('ACCESS_TOKEN_TTL_SECONDS:', process.env.ACCESS_TOKEN_TTL_SECONDS);
console.log('REFRESH_TOKEN_TTL_SECONDS:', process.env.REFRESH_TOKEN_TTL_SECONDS);

// src/services/jwtService.ts - 라인 55-56 제거
console.log('🔍 [JWT] Access token TTL:', accessTtlSeconds, 'seconds');
```