# Vapor API의 Node.js (TypeScript) 재구현

이 프로젝트는 기존 **Vapor API**를 **Node.js + TypeScript** 환경에서 재작성한 버전입니다.  
Supabase를 기반으로 한 **회원가입 / 로그인**, **JWT 인증 (Access + Refresh 토큰)**,  
**프로필 관련 API**, 그리고 동일한 **OpenAPI 문서(`/docs`)**를 제공합니다.

---

## ⚙️ 요구 사항

- Node.js **v18 이상**
- PostgreSQL 데이터베이스 (동일한 `users` 스키마 사용)
- Supabase 프로젝트 및 **서비스 롤 키 (Service Role Key)**

---

## 🚀 시작하기

```bash
cp .env.example .env
# 실제 환경 변수로 수정
npm install
npm run dev
```
서버는 기본적으로 `.env`에 정의된 **PORT (기본값 8080)** 에서 실행됩니다.  
Swagger UI 문서는 다음 경로에서 접근 가능합니다:

- [SwaggerApiDocs](https://sparatafinalapp.up.railway.app/api-docs/)

---

## 🗄️ 데이터베이스 설정

`DATABASE_URL` 또는 개별 변수(`DATABASE_*`) 중 하나를 설정할 수 있습니다.

서버는 자동으로 다음을 수행합니다:

- **Supabase / Render** 호스트(`*.supabase.co`) 감지 시 TLS 자동 활성화  
- `DATABASE_FORCE_IPV4=1` 설정 시 **IPv4 우선 연결 강제**

---

## 🔐 Supabase 설정

필수 환경 변수:

| 변수명 | 설명 |
|--------|------|
| `SUPABASE_URL` | Supabase 프로젝트의 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 서비스 롤 키 (서버 전용 관리자 키) |
| `SUPABASE_PROFILE_TABLE` | 프로필 테이블 이름 (기본값: `profiles`) |

서버는 Supabase **Admin API**를 이용해 사용자 생성/삭제 및  
`profiles` 테이블과의 동기화를 수행합니다.

---

## 📜 스크립트 명령어

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | 개발 모드 실행 (ts-node-dev, 실시간 감시) |
| `npm run build` | TypeScript → JavaScript로 빌드 (`dist/` 생성) |
| `npm start` | 빌드된 서버 실행 (`dist/server.js`) |

---

## 🌐 API 엔드포인트

### 기본 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/health` | 데이터베이스 연결 상태 점검 |

### 인증 엔드포인트

| 메서드 | 경로 | 설명 | 인증 방식 |
|--------|------|------|----------|
| `POST` | `/api/v1/auth/signup` | 회원가입 | - |
| `POST` | `/api/v1/auth/login` | 로그인 | - |
| `POST` | `/api/v1/auth/refresh` | 토큰 갱신 | JWT Bearer |
| `GET` | `/api/v1/auth/me` | 로그인 사용자 정보 조회 | JWT Bearer |

### 프로필 엔드포인트

| 메서드 | 경로 | 설명 | 인증 방식 |
|--------|------|------|----------|
| `GET` | `/api/v1/profile` | 사용자 프로필 조회 | JWT Bearer |
| `DELETE` | `/api/v1/profile` | 프로필 삭제 | JWT Bearer |

### 세션 엔드포인트

| 메서드 | 경로 | 설명 | 인증 방식 |
|--------|------|------|----------|
| `GET` | `/api/v1/session` | 현재 세션 정보 조회 | X-Session-ID |

---

## 🔐 인증 시스템

이 API는 **두 가지 인증 방식**을 지원합니다:

### 1. JWT 토큰 기반 인증

대부분의 API 엔드포인트에서 사용하는 표준 JWT 인증 방식입니다.

**헤더**: `Authorization: Bearer <access_token>`

**사용 엔드포인트**:
- `/api/v1/auth/me`
- `/api/v1/auth/refresh`
- `/api/v1/profile`

### 2. 세션 ID 기반 인증

세션 정보 조회 전용으로 사용하는 간단한 세션 ID 기반 인증입니다.

**헤더**: `X-Session-ID: <session_id>`

**사용 엔드포인트**:
- `/api/v1/session`

**세션 정보 응답 예시**:
```json
{
  "code": 200,
  "data": {
    "loginType": "email",
    "lastLoginAt": "2025-11-09T05:39:41.649Z",
    "userId": "7856e7cf-bc95-44bf-9073-fdf53f36d240",
    "email": "sessiontest@example.com",
    "sessionId": "6dc6ae7bcca872b327da17440eae56d6ce3c11d01ecc42d89b0adf8067ddce0e",
    "createdAt": "2025-11-08T21:33:15.396Z",
    "expiresAt": "2025-11-09T21:33:15.396Z"
  },
  "message": "Session info retrieved successfully"
}
```

**로그인 타입 구분**:
- `signup`: 회원가입을 통한 첫 로그인
- `email`: 이메일로 로그인
- `username`: 사용자명으로 로그인

### 로그인/회원가입 응답

로그인과 회원가입 성공 시 **JWT 토큰과 세션 ID를 모두** 반환합니다:

```json
{
  "code": 200,
  "data": {
    "user": { ... },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "accessTokenExpiresAt": "2025-11-10T05:39:56.500Z",
    "refreshTokenExpiresAt": "2025-11-16T05:39:56.500Z",
    "sessionId": "f55ccc2093224215a581c74fb9e5bfcf2ac06b589fb7bc1bf471fbc6fdc70d31",
    "sessionExpiresAt": "2025-11-10T05:39:56.505Z"
  },
  "message": "Login successful"
}
```

---

## 🧪 API 테스트

프로젝트에는 **Postman 컬렉션**이 포함되어 있어 쉽게 API를 테스트할 수 있습니다:

- **컬렉션**: `postman/SpartaFinalProject_API_Collection.postman_collection.json`
- **환경 설정**: `postman/SpartaFinalProject_Environment.postman_environment.json`
- **사용 가이드**: `postman/README.md`

Postman 컬렉션은 다음 기능을 제공합니다:
- 🔄 토큰 자동 관리 (로그인 시 자동 저장)
- 🆔 세션 ID 자동 관리
- 📋 전체 사용자 플로우 테스트 시나리오
- 🔍 로그인 타입별 테스트

---

## 📦 응답 구조

모든 응답은 다음의 공통 형식을 따릅니다:

```json
{
  "code": 200,
  "message": "요청 성공 메시지",
  "data": {
    "user": { ... },
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

이는 기존 **Vapor API**의 응답 포맷(`{ code, data?, message? }`)과 완전히 동일합니다.

---

## 📚 기술 스택

- **Node.js + TypeScript**
- **Express.js**
- **PostgreSQL / Supabase**
- **JWT (Access + Refresh Token)**
- **Swagger UI / OpenAPI 3.0**
- **Docker / Render 배포 지원**

---

> ✨ 이 서버는 기존 Vapor 프로젝트와 완벽히 동일한 API 구조를 유지하면서  
> Node.js 환경에서 보다 손쉽게 배포(예: Render, Vercel, AWS)할 수 있도록 설계되었습니다.
