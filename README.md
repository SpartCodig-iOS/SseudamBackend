# Supabase Auth API (Nest.js + TypeScript)

Nest.js 기반의 인증/프로필 API로, 기존 Express 서버와 동일한 기능을 유지하면서 구조만 Nest 아키텍처로 재구성했습니다. Supabase Admin API, JWT 토큰, 그리고 세션 기반 인증을 그대로 제공하며 Swagger 문서(`/api-docs`)도 기존 Autogen JSON을 활용합니다.

---

## ⚙️ 요구 사항

- Node.js **v18 이상**
- PostgreSQL (선택: `DATABASE_URL` 또는 개별 `DATABASE_*`)
- Supabase 프로젝트 + **Service Role Key**

---

## 🚀 시작하기

```bash
cp .env.example .env
# 환경 변수 수정
npm install
npm run dev
```

- 기본 포트: `.env` 의 `PORT` (기본 8080)
- Swagger UI: `http://localhost:8080/api-docs`
- 운영 배포: https://sparatafinalapp.up.railway.app/api-docs/

Nest 앱 엔트리포인트는 `src/main.ts`, 프로덕션은 `node dist/main.js` 입니다.

---

## 📦 스크립트

| 명령어         | 설명                                      |
|----------------|-------------------------------------------|
| `npm run dev`  | ts-node-dev 로 개발 서버(핫 리로드) 실행 |
| `npm run build`| TypeScript → `dist/` 빌드                |
| `npm start`    | 빌드된 Nest 앱 실행 (`dist/main.js`)     |

빌드 시 남은 산출물을 지우고 싶다면 `rm -rf dist && npm run build` 를 사용하세요.

---

## 🗄️ 데이터베이스 / 네트워크

- `DATABASE_URL` 또는 `DATABASE_*` 변수를 통해 접속 정보 설정
- Supabase / Render 호스트(`*.supabase.co`, `*.render.com`)는 자동으로 TLS 를 사용
- `DATABASE_FORCE_IPV4=1` 설정 시 IPv4 우선 연결
- `DATABASE_REQUIRE_TLS`, `DATABASE_SSL_REJECT_UNAUTHORIZED` 로 세부 TLS 제어

---

## 🔐 Supabase 설정

| 변수명                      | 설명                                     |
|-----------------------------|------------------------------------------|
| `SUPABASE_URL`              | Supabase 프로젝트 URL                    |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin API 호출을 위한 Service Role Key   |
| `SUPABASE_PROFILE_TABLE`    | 프로필 테이블명 (기본값 `profiles`)      |

서버는 Admin API 로 사용자 생성/삭제를 수행하고 `profiles` 테이블을 동기화합니다.

---

## 📜 Swagger 문서

- Nest `@nestjs/swagger` + DocumentBuilder 기반으로 **OpenAPI 3** 스펙을 런타임에 자동 생성합니다.
- 컨트롤러/DTO에 Swagger 데코레이터(`@ApiOperation`, `@ApiResponse`, `@ApiProperty` 등)를 추가하면 `/api-docs`에 즉시 반영됩니다.
- 로컬/도커/배포 환경이 모두 동일한 `/api-docs` 엔드포인트를 사용합니다.

---

## 🌐 API 엔드포인트

### 헬스체크

| 메서드 | 경로        | 설명                  |
|--------|-------------|-----------------------|
| `GET`  | `/health`   | Supabase 연결 상태 확인|

### 인증

| 메서드 | 경로                      | 설명               | 인증 |
|--------|---------------------------|--------------------|------|
| `POST` | `/api/v1/auth/signup`     | 회원가입           | -    |
| `POST` | `/api/v1/auth/login`      | 로그인 (이메일/아이디) | - |
| `POST` | `/api/v1/auth/refresh`    | 토큰 재발급        | Refresh Token |
| `DELETE` | `/api/v1/auth/account`  | 계정 삭제 (Supabase 포함) | Bearer |

### 프로필

| 메서드 | 경로                      | 설명             | 인증 |
|--------|---------------------------|------------------|------|
| `GET`  | `/api/v1/profile/me`      | 내 프로필 조회   | Bearer |

### 세션

| 메서드 | 경로                | 설명                | 인증 |
|--------|---------------------|---------------------|------|
| `GET`  | `/api/v1/session`   | 세션 정보 조회      | `X-Session-ID` |

---

## 🔐 인증 방식

1. **JWT Bearer**
   - 헤더: `Authorization: Bearer <access_token>`
   - 사용처: `/api/v1/profile/me`, `/api/v1/auth/account`, Protected API

2. **세션 ID**
   - 헤더: `X-Session-ID: <session_id>`
   - 사용처: `/api/v1/session`

로그인/회원가입 시 응답 예시는 기존과 동일합니다:
```json
{
  "code": 200,
  "data": {
    "user": { "...": "..." },
    "accessToken": "ey...",
    "refreshToken": "ey...",
    "accessTokenExpiresAt": "2025-11-10T05:39:56.500Z",
    "refreshTokenExpiresAt": "2025-11-16T05:39:56.500Z",
    "sessionId": "f55ccc20...",
    "sessionExpiresAt": "2025-11-10T05:39:56.505Z"
  },
  "message": "Login successful"
}
```

---

## 🧪 Postman

- 컬렉션: `postman/SpartaFinalProject_API_Collection.postman_collection.json`
- 환경: `postman/SpartaFinalProject_Environment.postman_environment.json`
- 가이드: `postman/README.md`

토큰 & 세션 ID 자동 관리, 로그인 타입 별 테스트 시나리오를 포함하고 있습니다.

---

## 🐳 Docker

멀티 스테이지 `Dockerfile` 로 Nest 빌드를 포함합니다.

```bash
docker compose up --build
# 혹은
docker build -t sparta-final .
docker run -p 8080:8080 --env-file .env sparta-final
```

컨테이너는 `node dist/main.js` 로 Nest 앱을 실행하며, `/api-docs` 가 동일하게 노출됩니다.

---

## ❓ FAQ

- **왜 `dist/` 에 옛 JS 파일이 남나요?**  
  TypeScript 빌드는 자동으로 삭제하지 않으므로 `rm -rf dist` 후 빌드하면 정리됩니다.

- **Swagger 스펙은 어디서 수정하나요?**  
  각 컨트롤러/DTO에 Swagger 데코레이터를 추가/수정하면 `/api-docs`가 자동 반영됩니다.

---

이제 전체 서버는 Nest.js 로 동작하며, 기존 API 계약과 응답 포맷은 그대로 유지됩니다.
