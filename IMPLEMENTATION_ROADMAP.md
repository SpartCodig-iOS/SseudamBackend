# 📋 우선순위별 실행 계획

## 🚨 Phase 1: 긴급 보안 수정 (즉시 - 1일)

### 1.1 Critical Security Fixes
- [ ] **Dev Controller 보안 가드 복구**
  ```bash
  # dev.controller.ts 라인 66-68 주석 해제
  if (env.nodeEnv !== 'development') {
    throw new ForbiddenException('This endpoint is only available in development environment');
  }
  ```

- [ ] **bcrypt 캐시 완전 제거**
  ```bash
  # auth.service.ts에서 제거:
  # - 라인 115-143: bcrypt 캐시 로직
  # - 라인 200: 캐시 체크 로직
  # - 라인 281-288: 캐시 설정 로직
  ```

- [ ] **하드코딩 사용자 ID 제거**
  ```bash
  # auth.guard.ts 라인 217-225 제거
  # 또는 적절한 관리자 인증으로 대체
  ```

- [ ] **JWT 비밀키 기본값 수정**
  ```typescript
  // env.ts 수정
  jwtSecret: process.env.JWT_SECRET || (() => {
    if (env.nodeEnv === 'production') {
      throw new Error('JWT_SECRET is required in production');
    }
    return `dev-secret-${Date.now()}`;
  })(),
  ```

### 1.2 Debug 로그 제거
- [ ] `config/env.ts` 디버그 로그 제거
- [ ] `services/jwtService.ts` 토큰 로그 제거

## 🏗️ Phase 2: 아키텍처 개선 (1-2주)

### 2.1 데이터베이스 아키텍처 통합
- [ ] **기존 서비스 TypeORM 마이그레이션**
  ```bash
  # 우선순위:
  # 1. AuthService.authenticateUserDirect()
  # 2. SocialAuthService 주요 쿼리들
  # 3. TravelService 쿼리들
  # 4. 나머지 서비스들
  ```

- [ ] **이중 연결 풀 제거**
  ```typescript
  // 옵션 A: TypeORM으로 완전 통합 (권장)
  // 옵션 B: 단일 Pool 공유
  ```

### 2.2 서비스 계층 재구성
- [ ] **Auth 서비스 통합**
  ```bash
  # 통합할 서비스들:
  # - AuthService
  # - EnhancedAuthService
  # - AuthTypeOrmAdapter
  # - TypeOrmAuthService
  # - OptimizedDeleteService

  # → UnifiedAuthService 하나로 통합
  ```

- [ ] **SharedModule 분해**
  ```bash
  # CoreModule: 핵심 전역 서비스 (JWT, Cache, DB)
  # SecurityModule: 보안 가드들 (APP_GUARD로 등록)
  # AuthModule: 인증 관련 서비스들
  ```

### 2.3 타입 안전성 개선
- [ ] **any 타입 제거**
  ```bash
  # 우선순위:
  # 1. auth.controller.ts의 payload as any
  # 2. enhanced-auth.service.ts의 메서드 캐스팅
  # 3. cacheService.ts의 data: any
  ```

- [ ] **인터페이스 정의**
  ```typescript
  interface AuthServiceInterface {
    authenticate(identifier: string, password: string): Promise<User | null>;
    login(input: LoginInput): Promise<AuthSessionPayload>;
  }
  ```

## 🚀 Phase 3: 성능 및 품질 개선 (1-2주)

### 3.1 성능 최적화
- [ ] **Redis KEYS → SCAN 변환**
  ```bash
  # cacheService.ts의 delPattern 메서드 수정
  ```

- [ ] **메모리 캐시 최적화**
  ```bash
  npm install lru-cache
  # Map 캐시들을 LRU로 교체
  ```

- [ ] **데이터베이스 쿼리 최적화**
  ```bash
  # N+1 쿼리 문제 해결
  # JOIN을 사용한 집계 쿼리 구현
  ```

### 3.2 환경 설정 개선
- [ ] **환경별 설정 분리**
  ```bash
  # development, staging, production, test 환경별 최적화
  ```

- [ ] **환경 변수 검증**
  ```bash
  npm install class-validator class-transformer
  # EnvironmentVariables 클래스 구현
  ```

### 3.3 로깅 및 모니터링
- [ ] **구조화된 로깅 구현**
  ```bash
  # AppLogger 서비스 구현
  # 민감한 정보 마스킹
  ```

- [ ] **Health Check 개선**
  ```bash
  # DB, Redis, 외부 서비스 상태 체크
  ```

## 🧪 Phase 4: 테스트 및 문서화 (1주)

### 4.1 테스트 인프라 구축
- [ ] **Jest 설정**
  ```bash
  npm install --save-dev jest @nestjs/testing @types/jest
  # node:test → Jest 마이그레이션
  ```

- [ ] **핵심 컴포넌트 테스트**
  ```bash
  # 테스트 우선순위:
  # 1. UnifiedAuthService
  # 2. AuthGuard
  # 3. UserRepository
  # 4. TravelService
  ```

### 4.2 API 문서화
- [ ] **Swagger 문서 개선**
  ```bash
  # DTO 타입 정의
  # 에러 응답 문서화
  # 예시 데이터 추가
  ```

- [ ] **아키텍처 문서 업데이트**
  ```bash
  # 변경된 아키텍처 반영
  # 개발 가이드 업데이트
  ```

## 🚢 Phase 5: 배포 및 운영 (1주)

### 5.1 배포 최적화
- [ ] **Docker 이미지 최적화**
  ```bash
  # 멀티스테이지 빌드
  # 이미지 크기 최소화
  ```

- [ ] **CI/CD 파이프라인**
  ```bash
  # 자동 테스트 실행
  # 보안 스캔
  # 배포 자동화
  ```

### 5.2 운영 도구
- [ ] **메트릭 수집**
  ```bash
  # Prometheus metrics
  # API 응답 시간 측정
  ```

- [ ] **에러 추적**
  ```bash
  # Sentry 설정 개선
  # 구조화된 에러 로깅
  ```

---

## 📊 예상 소요 시간

| Phase | 작업 | 소요 시간 | 누적 |
|-------|------|----------|------|
| Phase 1 | 긴급 보안 수정 | 1일 | 1일 |
| Phase 2 | 아키텍처 개선 | 1-2주 | ~15일 |
| Phase 3 | 성능 최적화 | 1-2주 | ~29일 |
| Phase 4 | 테스트 & 문서 | 1주 | ~36일 |
| Phase 5 | 배포 & 운영 | 1주 | ~43일 |

**총 예상 소요 시간: 6-7주**

## 🎯 각 Phase별 성공 지표

### Phase 1 성공 지표
- [ ] 모든 보안 취약점 패치 완료
- [ ] 프로덕션에서 무한 토큰 생성 불가
- [ ] 디버그 로그 완전 제거

### Phase 2 성공 지표
- [ ] 단일 데이터베이스 아키텍처 구축
- [ ] 서비스 수 50% 감소 (20개 → 10개)
- [ ] any 타입 사용 90% 감소

### Phase 3 성능 지표
- [ ] API 응답 시간 30% 향상
- [ ] 메모리 사용량 20% 감소
- [ ] 데이터베이스 연결 수 50% 감소

### Phase 4 품질 지표
- [ ] 테스트 커버리지 80% 이상
- [ ] 핵심 컴포넌트 100% 테스트 커버리지
- [ ] API 문서 완성도 95%

### Phase 5 운영 지표
- [ ] 배포 시간 50% 단축
- [ ] 이미지 크기 30% 감소
- [ ] 모니터링 대시보드 구축