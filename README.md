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

👉 **http://localhost:8080/docs**

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

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/health` | 데이터베이스 연결 상태 점검 |
| `POST` | `/api/v1/auth/signup` | 회원가입 |
| `POST` | `/api/v1/auth/login` | 로그인 |
| `POST` | `/api/v1/auth/refresh` | 토큰 갱신 |
| `GET` | `/api/v1/auth/me` | 로그인 사용자 정보 조회 |
| `GET` | `/api/v1/auth/profile` | 사용자 프로필 조회 |
| `DELETE` | `/api/v1/auth/profile` | 프로필 삭제 |

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
