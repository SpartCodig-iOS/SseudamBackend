# 🌍 쓰담 (SseuDam) - 여행 정산 서비스

<div align="center">

**🚀 여행 후 복잡한 정산 과정을 쉽고 투명하고 간편하게 해결하는 서비스**

[![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?style=flat-square&logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10.0+-E0234E?style=flat-square&logo=nestjs)](https://nestjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-336791?style=flat-square&logo=postgresql)](https://postgresql.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com/)

[🌐 웹사이트](https://sseudam.up.railway.app/) | [📚 API 문서](https://sseudam.up.railway.app/api-docs/) | [🔴 라이브 서버](https://sseudam.up.railway.app/) | [📋 이용약관](https://sseudam.up.railway.app/terms/) | [🔒 개인정보처리방침](https://sseudam.up.railway.app/privacy/)
</div>

---

## ✨ 주요 기능

### 📱 모바일 앱 (출시 예정)
- 💰 **스마트 정산** - 복잡한 여행 경비를 자동으로 계산하고 각자의 몫을 정확하게 산출
- 📊 **투명한 관리** - 모든 지출 내역을 투명하게 공유하여 불필요한 오해를 방지
- ⚡ **간편한 사용** - 직관적인 인터페이스로 누구나 쉽게 여행 경비를 관리
- 🤝 **그룹 관리** - 여행 멤버들과 실시간으로 경비를 공유하고 관리
- 💳 **다양한 결제** - 카드, 현금 등 다양한 결제 수단을 지원하여 편리하게 기록
- 📊 **실시간 통계** - 여행 중 실시간으로 지출 현황과 정산 상태를 확인

### 🔧 백엔드 API
- 🔐 **다중 인증 지원** - JWT, Supabase, Apple/Google OAuth
- 💱 **환율 변환** - 실시간 환율 API 연동
- 🚀 **고성능 최적화** - 캐싱, 배치 처리, N+1 해결
- 🌐 **웹사이트** - 서비스 소개 및 법적 문서 제공

---

## 🛠 기술 스택

### Backend
- **Framework**: NestJS 10+ (Node.js, TypeScript)
- **Database**: PostgreSQL 16+
- **Auth**: Supabase Auth + JWT
- **API Docs**: OpenAPI 3.0 (Swagger)

### Infrastructure
- **Hosting**: Railway
- **Database**: Supabase PostgreSQL
- **Storage**: Supabase Storage (프로필 이미지)
- **Monitoring**: Built-in health checks

---

## 🚀 빠른 시작

### 1. 프로젝트 설정

```bash
# 저장소 클론
git clone <repository-url>
cd SseudamBackend

# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env
```

### 2. 환경 변수 구성

```env
# 서버 설정
PORT=8081
NODE_ENV=development

# 데이터베이스
DATABASE_URL=postgresql://username:password@host:port/database

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_PROFILE_TABLE=profiles

# JWT 시크릿
JWT_SECRET=your_jwt_secret

# OAuth (선택사항)
APPLE_CLIENT_ID=your_apple_client_id
APPLE_TEAM_ID=your_apple_team_id
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Redis (선택)
# REDIS_URL를 설정하지 않으면 자동으로 메모리 캐시만 사용합니다.
REDIS_URL=redis://localhost:6379

# Observability / APM
SENTRY_DSN=https://xxx.ingest.sentry.io/123
SENTRY_TRACES_SAMPLE_RATE=0.2
SENTRY_PROFILES_SAMPLE_RATE=0.1
```

### 3. 개발 서버 실행

```bash
# 개발 모드 (핫 리로드)
npm run dev

# 프로덕션 빌드
npm run build
npm start
```

서버가 실행되면:
- 🔗 **API**: `http://localhost:8081`
- 📚 **API 문서**: `http://localhost:8081/api-docs`
- 🩺 **헬스체크**: `http://localhost:8081/health`

---

## 📚 API 문서

### 🌐 Swagger UI
**라이브 문서**: [https://sseudam.up.railway.app/api-docs/](https://sseudam.up.railway.app/api-docs/)

### 주요 엔드포인트

#### 🔐 인증
```http
POST /api/v1/auth/signup          # 회원가입
POST /api/v1/auth/logout          # 로그아웃 (sessionId 필요)
POST /api/v1/auth/login           # 로그인
POST /api/v1/auth/refresh         # 토큰 갱신
DELETE /api/v1/auth/account       # 계정 삭제
```

#### 🌍 여행 관리
```http
GET    /api/v1/travels            # 여행 목록
POST   /api/v1/travels            # 여행 생성
POST   /api/v1/travels/{id}/invite # 초대 코드 생성
PATCH  /api/v1/travels/{id}/owner  # 호스트 권한 위임 (호스트만 호출, 기존 호스트는 member로 강등)
DELETE /api/v1/travels/{id}/leave  # 여행 나가기 (본인만, 호스트는 불가)
DELETE /api/v1/travels/{id}       # 여행 삭제
```

#### 💰 지출 관리
```http
GET  /api/v1/travels/{id}/expenses     # 지출 목록
POST /api/v1/travels/{id}/expenses     # 지출 기록
GET  /api/v1/travels/{id}/settlements  # 정산 내역
```

#### 👤 프로필
```http
GET   /api/v1/profile/me          # 프로필 조회
PATCH /api/v1/profile/me          # 프로필 수정 (이미지 업로드 포함)
```

#### 📊 메타 정보
```http
GET /api/v1/meta/countries        # 국가/통화 정보
GET /api/v1/meta/exchange-rate?base=KRW&quote=USD&baseAmount=5000    # 실시간 환율
```

---

## 🏗 프로젝트 구조

```
src/
├── app.module.ts              # 애플리케이션 루트 모듈
├── main.ts                    # 엔트리포인트
├── config/                    # 설정 파일들
│   ├── env.ts                 # 환경 변수
│   └── swagger.ts             # Swagger 설정
├── modules/                   # 기능별 모듈들
│   ├── auth/                  # 인증 모듈
│   ├── profile/               # 프로필 관리
│   ├── travel/                # 여행 관리
│   ├── travel-expense/        # 지출 관리
│   ├── settlement/            # 정산 모듈
│   └── meta/                  # 메타 정보
├── common/                    # 공통 컴포넌트
│   ├── guards/                # 인증 가드
│   ├── filters/               # 예외 필터
│   └── middlewares/           # 미들웨어
├── services/                  # 공통 서비스
│   ├── jwtService.ts          # JWT 관리
│   └── supabaseService.ts     # Supabase 연동
├── db/                        # 데이터베이스
│   └── pool.ts                # 연결 풀 관리
└── utils/                     # 유틸리티 함수
```

---

## ⚡ 성능 최적화

### 🚀 구현된 최적화들

- **배치 INSERT**: 여러 참가자 데이터를 한 번에 처리
- **토큰 캐싱**: Supabase 인증 호출 95% 감소
- **연결 풀 최적화**: 프로덕션 환경 25개 연결 풀
- **환율 API 캐싱**: 10분 TTL로 외부 API 호출 최소화
- **미들웨어 최적화**: 헬스체크 경로 로깅 제외
- **N+1 쿼리 해결**: LATERAL JOIN으로 단일 쿼리 처리
- **로그 레벨 제어**: `LOG_LEVEL` 로 Nest 로거 단계 제한 (prod에서는 `warn` 권장)
- **회원가입 최적화**: 직접 DB 프로필 생성으로 안정성 향상
- **사용자명 생성**: 고유성 보장 및 충돌 방지 알고리즘
- **OAuth Redis 캐싱**: Access Token → 사용자 조회를 Redis + fallback 메모리 캐시로 5분간 유지
- **정교한 캐시 무효화**: 사용자 ID 기반 토큰 인덱스를 유지해 소셜 연결 해제/계정 삭제 시 즉시 캐시 제거
- **HTTP Response 압축**: `compression` 미들웨어로 1KB 이상 응답을 gzip하여 전송
- **APM/프로파일링**: Sentry + OpenTelemetry 연동으로 트레이스/프로파일 데이터 자동 수집
- **DB 인덱스 최적화**: 핵심 테이블 성능 인덱스 적용 (아래 SQL 참조)

### 📈 성능 개선 결과

| 작업 | 이전 | 이후 | 개선율 |
|------|------|------|--------|
| 지출 생성 (10명) | 100-150ms | 20-40ms | **60-80%** |
| 토큰 인증 | 50-200ms | 5-15ms | **70-90%** |
| 환율 조회 | 1-3초 | 100-300ms | **80-90%** |

---

## 🔒 보안 기능

- **JWT 기반 인증** - Access & Refresh Token
- **파일 업로드 보안** - 크기/타입 제한 (5MB, 이미지만)
- **네트워크 타임아웃** - 8초 제한으로 DoS 방지
- **입력 검증** - Zod 스키마 기반 유효성 검사
- **CORS 설정** - 안전한 크로스 오리진 요청
- **헬멧 보안** - HTTP 보안 헤더 자동 설정

---

## 🧪 테스트 및 개발

### Docker 지원
```bash
# Docker Compose
docker compose up --build

# 단일 컨테이너
docker build -t sseduam-backend .
docker run -p 8081:8081 --env-file .env sseduam-backend
```

### 개발 스크립트
```bash
npm run dev        # 개발 서버 (핫 리로드)
npm run build      # TypeScript 빌드
npm start          # 프로덕션 서버
```

---

## 🌐 웹사이트

쓰담 서비스는 완전한 웹사이트를 제공하여 사용자들이 서비스를 쉽게 이해하고 법적 정보에 접근할 수 있습니다.

### 📄 제공 페이지
- **🏠 메인 홈페이지** - 서비스 소개 및 주요 기능 6가지 설명
- **📋 서비스 이용약관** - 총 18개 조항의 완전한 이용약관 (2025.11.24 시행)
- **🔒 개인정보처리방침** - 총 12개 섹션의 개인정보 정책 (GDPR 준수)

### ✨ 웹사이트 특징
- **🎨 깔끔한 디자인** - 모던하고 직관적인 사용자 인터페이스
- **💻 데스크톱 최적화** - PC 환경에 최적화된 레이아웃
- **⚡ 빠른 로딩** - 정적 파일 기반으로 빠른 응답속도
- **🔗 쉬운 네비게이션** - 모든 페이지 간 원활한 이동

### 🛠 기술 구현
- **정적 HTML** - NestJS 정적 파일 서빙
- **모던 CSS** - Flexbox, Grid, CSS3 애니메이션
- **법적 컴플라이언스** - 개인정보보호법 및 관련 법령 준수
- **SEO 최적화** - 검색엔진 친화적 구조

---

## 🌐 배포 및 운영

### 🔴 라이브 환경
- **메인 웹사이트**: https://sseudam.up.railway.app
- **API 문서**: https://sseudam.up.railway.app/api-docs/
- **이용약관**: https://sseudam.up.railway.app/terms/
- **개인정보처리방침**: https://sseudam.up.railway.app/privacy/
- **헬스체크**: https://sseudam.up.railway.app/health

### 🔧 운영 모니터링
```http
GET /health                 # 서버 상태
GET /health/database        # DB 연결 상태
GET /health/supabase        # Supabase 연결 상태
```

---


<div align="center">

**Built with ❤️ using NestJS & TypeScript**

[![TypeScript](https://img.shields.io/badge/Made%20with-TypeScript-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/Powered%20by-NestJS-red?style=flat-square&logo=nestjs)](https://nestjs.com/)

</div>
