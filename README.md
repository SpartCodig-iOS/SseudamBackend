# VaporDockerApp

💧 A project built with the Vapor web framework.

## Getting Started

To build the project using the Swift Package Manager, run the following command in the terminal from the root of the project:
```bash
swift build
```

To run the project and start the server, use the following command:
```bash
swift run
```

To execute tests, use the following command:
```bash
swift test
```

## Superbase 연동 설정

1. `.env.example` 파일을 복사하여 `.env`를 생성합니다.
   ```bash
   cp .env.example .env
   ```
2. 실제 Superbase 프로젝트에서 발급받은 `SUPERBASE_URL`과 `SUPERBASE_ANON_KEY`, 그리고 `JWT_SECRET` 값을 `.env`에 채워 넣습니다. `SUPERBASE_ANON_KEY`에는 **service_role** 키를 사용해야 서버에서 RLS 정책을 통과하며 테이블에 동기화할 수 있습니다. (기존 `SUPABASE_*` 변수도 호환을 위해 동작합니다.)
3. `SUPERBASE_PROFILE_TABLE` 값(기본 `profiles`)을 지정하면 회원가입 시 Superbase Postgres 테이블에 사용자 정보가 동기화됩니다.
4. Vapor 애플리케이션은 `supabase-swift` 라이브러리를 사용하여 Superbase 인증/데이터 연동을 수행하며, 앱 로그인 시 이메일 전체 또는 이메일 @ 앞의 `username` 둘 다 허용합니다.

Superbase 프로젝트에 아래와 같은 테이블이 준비되어 있어야 합니다 (기본 테이블명: `profiles`).

```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null unique,
  username text not null unique,
  name text,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

alter table public.profiles
  enable row level security;

create policy "Public profiles read" on public.profiles for select
  using ( true );
```

> ❗️ `.env*`는 `.gitignore`에 포함되어 있으므로 민감한 자격 증명이 GitHub에 업로드되지 않도록 반드시 `.env`만 사용하세요.

## 보안 체크리스트 (GitHub 업로드 전)

- 민감한 값은 `.env` 또는 CI/CD 시크릿에만 저장하기
- `API_Examples.md` 등 문서에는 예시 값만 사용하고 실제 키는 넣지 않기
- 커밋 전 `git diff`로 비밀 정보가 포함되지 않았는지 점검하기

## 운영 편의 기능

- `GET /health`: 애플리케이션 및 데이터베이스 상태 확인
- `GET /docs`: Swagger UI (OpenAPI 문서 `/openapi.json` 기반)

## Docker + Postman 테스트 가이드

1. **이미지 빌드 & 컨테이너 실행**
   ```bash
   docker compose --env-file .env build
   docker compose --env-file .env up -d db
   docker compose --env-file .env run --rm migrate
   docker compose --env-file .env up app
   ```
   - `db` 컨테이너가 포그라운드에서 정상 기동되면, 다른 터미널에서 `docker compose logs -f app`으로 상태를 확인할 수 있습니다.

2. **Postman 컬렉션 임포트**
   - `postman/VaporDockerApp.postman_collection.json`
   - `postman/VaporDockerApp.postman_environment.json`
   - Postman에서 컬렉션과 환경을 각각 임포트한 뒤 `VaporDockerApp Local` 환경을 선택합니다.

3. **테스트 순서**
   1. `Signup > Signup`
   2. `Auth > Login` (테스트 스크립트가 `accessToken`, `refreshToken`, 만료 시각을 환경 변수에 저장)
   3. `Auth > Refresh Token`으로 토큰 갱신 확인 (선택)
   4. `Profile > Me` 또는 `Profile > Profile`
   5. `Profile > Delete Account` (선택)

컨테이너를 종료하려면 `docker compose down`을 실행하세요.

회원가입 성공 시 Superbase Auth와 동시에 `SUPERBASE_PROFILE_TABLE`에 사용자 레코드가 upsert되므로 Superbase 대시보드에서도 곧바로 확인할 수 있습니다.

## Render 배포 가이드

이 프로젝트는 Render 무료 플랜에서 Docker를 사용하여 배포할 수 있도록 설정되어 있습니다.

### 1. GitHub Repository 준비
```bash
git add .
git commit -m "Setup CI/CD and Render deployment"
git push origin main
```

### 2. Render.com에서 웹 서비스 생성

1. [Render.com](https://render.com)에 회원가입/로그인
2. 새 Web Service 생성
3. GitHub Repository 연결
4. 다음 설정 사용:
   - **Runtime**: Docker
   - **Branch**: main
   - **Root Directory**: (비워둠)
   - **Dockerfile Path**: ./Dockerfile

### 3. 환경 변수 설정

Render 대시보드에서 다음 환경 변수들을 설정:

**필수 환경 변수:**
```
JWT_SECRET=your-secret-jwt-key-here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPERBASE_URL=https://your-project.supabase.co
SUPERBASE_ANON_KEY=your-supabase-anon-key
SUPERBASE_PROFILE_TABLE=profiles
LOG_LEVEL=info
ENVIRONMENT=production
```

### 4. GitHub Actions Secrets 설정 (CI/CD용)

Repository Settings > Secrets and variables > Actions에서 설정:

```
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
RENDER_SERVICE_ID=your-render-service-id
RENDER_API_KEY=your-render-api-key
```

### 5. 자동 배포

- `main` 브랜치에 푸시할 때마다 GitHub Actions가 자동으로:
  1. 테스트 실행
  2. Docker 이미지 빌드
  3. Render에 배포
  4. 보안 스캔 수행

### 6. HTTPS 접속

Render는 자동으로 HTTPS를 제공합니다:
- `https://your-service-name.onrender.com`

### 주요 특징

✅ **무료 호스팅**: Render 무료 플랜 사용
✅ **자동 HTTPS**: SSL 인증서 자동 관리
✅ **Docker 지원**: 컨테이너 기반 배포
✅ **CI/CD 파이프라인**: GitHub Actions 자동 빌드/배포
✅ **Supabase 연동**: 무료 PostgreSQL 데이터베이스
✅ **보안 스캔**: Trivy 취약점 검사

### 트러블슈팅

**배포 실패 시:**
1. Render 로그 확인
2. 환경 변수 설정 점검
3. Supabase 연결 상태 확인
4. GitHub Actions 로그 검토

**무료 플랜 제한:**
- 15분간 비활성 시 서비스 슬립 (첫 요청 시 웨이크업)
- 월 750시간 무료 사용 시간
- 외부 데이터베이스 연결 권장 (Supabase 사용)

### See more

- [Vapor Website](https://vapor.codes)
- [Vapor Documentation](https://docs.vapor.codes)
- [Vapor GitHub](https://github.com/vapor)
- [Vapor Community](https://github.com/vapor-community)
- [Render Documentation](https://render.com/docs)
- [Supabase Documentation](https://supabase.com/docs)
