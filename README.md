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
| `APPLE_CLIENT_ID`           | Apple Services ID (ex: `io.example.app`) |
| `APPLE_TEAM_ID`             | Apple Team ID                            |
| `APPLE_KEY_ID`              | Apple private key ID                     |
| `APPLE_PRIVATE_KEY`         | Apple `.p8` 개인키 (줄바꿈은 `\n` 혹은 multiline) |
| `GOOGLE_CLIENT_ID`          | Google OAuth Client ID (웹/모바일)       |
| `GOOGLE_CLIENT_SECRET`      | Google OAuth Client Secret               |
| `GOOGLE_REDIRECT_URI`       | Google OAuth redirect URI (기본값)       |

서버는 Admin API 로 사용자 생성/삭제를 수행하고 `profiles` 테이블을 동기화합니다.

### Supabase 소셜 로그인 연동

- 클라이언트(웹/모바일)에서 Supabase Auth SDK를 사용해 애플/구글 등 소셜 로그인을 수행하고, Supabase access token(JWT)을 발급받습니다.
- 로그인 전 분기 처리가 필요하면 `POST /api/v1/oauth/lookup` 으로 `{ accessToken, loginType? }` 를 보내 가입 여부(`registered` Boolean만 반환)를 확인하세요. true면 즉시 로그인 가능, false면 추가 약관/닉네임 입력 플로우를 띄울 수 있습니다.
- 소셜 로그인 이후 서버 세션/JWT가 필요하면 `POST /api/v1/oauth/signup` 또는 `POST /api/v1/oauth/login` 에 `{ accessToken, loginType?, appleRefreshToken?, googleRefreshToken?, authorizationCode?, codeVerifier?, redirectUri? }` 를 전송하세요. 애플/구글 최초 가입 시 Supabase가 `provider_refresh_token` 을 주지 않는다면 `authorizationCode` 와 (필요 시) `codeVerifier`, `redirectUri` 를 넘겨주면 서버가 각 Provider 토큰 교환을 통해 refresh token을 확보하여 저장합니다.
- 애플 로그인 연결 해제 시에는 Apple에서 내려준 `refresh_token`(또는 authorization code)을 앱이 보관했다가 `POST /api/v1/oauth/apple/revoke` 로 전달해야 합니다. 서버가 Apple `auth/revoke` 엔드포인트를 호출해 연결을 끊고, 해당 사용자 프로필 상태를 갱신할 수 있습니다.
- 일반 이메일/비밀번호 로그인은 `POST /api/v1/auth/login` 에 `{ identifier/email, password }` 를 전달하면 됩니다.
- `DELETE /api/v1/auth/account` 를 호출하면, 로그인 타입이 `apple`/`google` 인 경우 서버가 먼저 각 Provider revoke API(Apple, Google)를 내부적으로 실행하여 연결을 끊고, 이후 Supabase/프로필 계정을 삭제합니다.
- 추가로 유저 프로필을 싱크하거나 RLS를 사용하는 API에서는 Supabase 토큰을 그대로 사용해도 되고, 서버 JWT를 사용해도 됩니다.

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

### OAuth (소셜)

| 메서드 | 경로                      | 설명               | 인증 |
|--------|---------------------------|--------------------|------|
| `POST` | `/api/v1/oauth/lookup`    | Supabase access token으로 가입 여부 확인 | - |
| `POST` | `/api/v1/oauth/signup`    | 소셜/OAuth access token → 서버 JWT 발급 (`appleRefreshToken`, `googleRefreshToken`, `authorizationCode` 등 전달 가능) | - |
| `POST` | `/api/v1/oauth/login`     | 소셜/OAuth access token으로 로그인 | - |
| `POST` | `/api/v1/oauth/apple/revoke` | Apple refresh token으로 애플 로그인 해제 | Bearer |

### 여행

| 메서드 | 경로                  | 설명                                      | 인증 |
|--------|-----------------------|-------------------------------------------|------|
| `GET`  | `/api/v1/travels`     | 내가 참여 중인 여행 목록 조회             | Bearer |
| `POST` | `/api/v1/travels`     | 여행 이름/기간/국가/환율을 입력해 새 여행 생성 | Bearer |
| `POST` | `/api/v1/travels/{travelId}/invite` | 호스트가 초대 코드 생성 | Bearer |
| `POST` | `/api/v1/travels/join` | 초대 코드로 여행 참여 | Bearer |
| `PATCH` | `/api/v1/travels/{travelId}` | 여행 정보 수정 (호스트 전용) | Bearer |
| `DELETE` | `/api/v1/travels/{travelId}` | 여행 삭제 (호스트 전용) | Bearer |
| `DELETE` | `/api/v1/travels/{travelId}/members/{memberId}` | 멤버 제거 (호스트 전용) | Bearer |
| `GET` | `/api/v1/travels/{travelId}/expenses` | 여행 지출 목록 조회 | Bearer |
| `POST` | `/api/v1/travels/{travelId}/expenses` | 여행 지출 추가 (금액/통화/참여자) | Bearer |

### 실시간 지출 공유 (Supabase Realtime)

- `db/migrations/002_enable_travel_expense_realtime.sql` 을 실행해 `travel_expenses`, `travel_expense_participants` 테이블을 `supabase_realtime` 퍼블리케이션에 등록하면, Supabase Realtime 으로 자동 브로드캐스트됩니다.
- 프런트엔드는 다음과 같이 구독하면 됩니다:

```swift
import Supabase

let supabase = SupabaseClient(
  supabaseURL: URL(string: "https://YOUR_PROJECT.supabase.co")!,
  supabaseKey: "YOUR_ANON_KEY"
)

let channel = supabase.channel("travel-expenses-\(travelId)")

channel.on(
  PostgresChangeEvent.all,
  schema: "public",
  table: "travel_expenses",
  filter: "travel_id=eq.\(travelId)"
) { payload in
  if let newRow = payload.newRecord {
    // 지출 생성/수정
  }
  if let oldRow = payload.oldRecord {
    // 삭제 감지
  }
}

channel.on(
  PostgresChangeEvent.all,
  schema: "public",
  table: "travel_expense_participants",
  filter: "expense_id=eq.\(expenseId)"
) { payload in
  // 참여자 변경 처리
}

channel.subscribe()
```

- 실시간 이벤트를 받으면 `/api/v1/travels/{travelId}/expenses` 를 다시 호출하거나, payload 기반으로 UI 를 갱신하면 됩니다.

### 메타 정보

| 메서드 | 경로                       | 설명                               | 인증 |
|--------|----------------------------|------------------------------------|------|
| `GET`  | `/api/v1/meta/countries`   | 국가/통화 메타 데이터 (한글/영문) 조회 | -    |
| `GET`  | `/api/v1/meta/exchange-rate?base=KRW&quote=USD` | 외부 환율 API(Frankfurter) proxy (1000 기준 환산) | - |

### 프로필

| 메서드 | 경로                      | 설명             | 인증 |
|--------|---------------------------|------------------|------|
| `GET`  | `/api/v1/profile/me`      | 내 프로필 조회   | Bearer |
| `PATCH`| `/api/v1/profile/me`      | 내 프로필 수정 (이름 + 아바타 이미지 업로드, `multipart/form-data`) | Bearer |

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


### 소셜 로그인(애플)

Supabase Auth에서 제공하는 Apple OAuth를 그대로 사용하는 것이 가장 간단합니다. 아래 순서를 따르면 됩니다.

1. Supabase 대시보드 > Authentication > Providers > Apple 에서 Team ID, Services ID 등을 등록합니다.
2. Apple Developer 콘솔에 Supabase의 Redirect URI (`https://wqdizhgmgsjzvvdiflbg.supabase.co/auth/v1/callback`) 를 등록합니다.
3. 프런트엔드는 Supabase 문서에 나온 대로 `supabase.auth.signInWithOAuth({ provider: 'apple' })` 혹은 해당 authorize URL로 리다이렉트합니다. (`redirect_to` 파라미터로 완료 후 돌아갈 URL 지정)
4. 참고: [Supabase Apple 로그인 가이드](https://supabase.com/docs/guides/auth/social-login/auth-apple?environment=server&framework=nextjs&platform=web)

### 소셜 로그인(구글)

1. Google Cloud Console > API & Services > Credentials 에서 OAuth Client ID (웹/모바일)를 생성하고, 동일한 Redirect URI를 Supabase Provider 설정에도 등록합니다.
2. `.env` 에 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` 를 채워두면 서버가 `https://oauth2.googleapis.com/token` 으로 authorization code 교환을 수행할 수 있습니다.
3. PKCE를 사용하는 모바일/SPA라면 클라이언트에서 `code_verifier` 를 보관했다가 서버 호출 시 함께 전달하세요. 서버는 `authorizationCode + codeVerifier (+ redirectUri)` 로 refresh token을 교환하고, Supabase `profiles.google_refresh_token` 컬럼에 저장합니다.
4. 참고: [Supabase Google 로그인 가이드](https://supabase.com/docs/guides/auth/social-login/auth-google).
