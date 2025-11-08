# SpartaFinalProject API - Postman 컬렉션

Supabase 연동 인증 API를 테스트하기 위한 Postman 컬렉션입니다.

## 📁 파일 구성

- `SpartaFinalProject_API_Collection.postman_collection.json` - 메인 API 컬렉션
- `SpartaFinalProject_Environment.postman_environment.json` - 환경 변수 설정
- `README.md` - 이 가이드 파일

## 🚀 설치 및 설정

### 1. Postman에서 컬렉션 가져오기

1. Postman 실행
2. `Import` 버튼 클릭
3. `SpartaFinalProject_API_Collection.postman_collection.json` 파일 선택
4. `SpartaFinalProject_Environment.postman_environment.json` 파일도 함께 선택
5. Import 완료

### 2. 환경 설정

1. Postman 우측 상단의 환경 선택 드롭다운에서 `SpartaFinalProject Environment` 선택
2. 서버가 실행 중인지 확인 (http://localhost:8080)

## 📋 API 목록

### Health Check
- **서버 상태 체크** - `GET /health`

### Auth (인증)
- **회원가입** - `POST /api/v1/auth/signup`
- **로그인 (이메일)** - `POST /api/v1/auth/login`
- **로그인 (사용자명)** - `POST /api/v1/auth/login`
- **현재 사용자 정보 조회** - `GET /api/v1/auth/me`
- **토큰 갱신** - `POST /api/v1/auth/refresh`

### Session (세션) - 세션 ID 기반 인증
- **세션 정보 조회** - `GET /api/v1/session` (X-Session-ID 헤더 필요)

### Profile (프로필)
- **프로필 조회** - `GET /api/v1/profile`
- **계정 삭제** - `DELETE /api/v1/profile`

### Test Scenarios (테스트 시나리오)
- **완전한 사용자 플로우** - 회원가입부터 계정 삭제까지
- **로그인 타입 테스트** - 이메일/사용자명 로그인 테스트

## 🔧 자동화 기능

### 토큰 및 세션 자동 관리
- 로그인 성공 시 `accessToken`, `refreshToken`, `sessionId`가 자동으로 환경변수에 저장됩니다
- 토큰 갱신 시에도 새로운 토큰이 자동으로 업데이트됩니다
- 계정 삭제 시 토큰과 세션이 자동으로 정리됩니다

### 세션 ID 인증 사용법
1. 로그인 후 `sessionId`가 자동으로 환경변수에 저장됩니다
2. 세션 기반 API 호출 시 `X-Session-ID` 헤더에 `{{sessionId}}` 사용
3. JWT 토큰 대신 세션 ID로 인증 가능

### 로그 출력
- 각 API 호출 후 콘솔에 유용한 정보가 출력됩니다
- 토큰 저장, 로그인 타입, 로그인 시간 등을 확인할 수 있습니다

## 📖 사용 예시

### 1. 기본 플로우 테스트

1. **서버 상태 체크**
   - `Health Check` → `서버 상태 체크` 실행
   - 서버가 정상 동작하는지 확인

2. **회원가입**
   - `Auth` → `회원가입` 실행
   - 새로운 계정 생성 및 토큰 자동 저장

3. **내 정보 확인**
   - `Auth` → `현재 사용자 정보 조회` 실행
   - 인증된 사용자 정보 확인

4. **세션 정보 확인**
   - `Auth` → `세션 정보 조회` 실행
   - 로그인 타입과 시간 확인

### 2. 로그인 타입 테스트

1. **이메일 로그인**
   - `Auth` → `로그인 (이메일)` 실행
   - 세션 정보에서 `loginType: "email"` 확인

2. **사용자명 로그인**
   - `Auth` → `로그인 (사용자명)` 실행
   - 세션 정보에서 `loginType: "username"` 확인

### 3. 전체 시나리오 테스트

- `Test Scenarios` → `완전한 사용자 플로우` 폴더의 요청들을 순서대로 실행
- 1번부터 6번까지 순차적으로 실행하면 전체 플로우를 테스트할 수 있습니다

## 🌐 환경 변수

| 변수명 | 설명 | 기본값 |
|--------|------|--------|
| `baseUrl` | 서버 기본 URL | `http://localhost:8080` |
| `baseUrl_production` | 운영 서버 URL | `https://finalprojectsever.onrender.com` |
| `accessToken` | JWT 액세스 토큰 | (자동 설정) |
| `refreshToken` | JWT 리프레시 토큰 | (자동 설정) |
| `sessionId` | 세션 ID | (자동 설정) |
| `sessionExpiresAt` | 세션 만료 시간 | (자동 설정) |
| `userId` | 현재 사용자 ID | (자동 설정) |
| `testEmail` | 테스트용 이메일 | `testuser@example.com` |
| `testPassword` | 테스트용 비밀번호 | `password123` |
| `testUsername` | 테스트용 사용자명 | `testuser` |
| `testName` | 테스트용 이름 | `테스트 사용자` |

## 🔍 주요 기능

### 로그인 타입 추적
- 이메일로 로그인: `loginType: "email"`
- 사용자명으로 로그인: `loginType: "username"`
- 회원가입: `loginType: "signup"`

### JWT 토큰 관리
- Access Token: 24시간 유효
- Refresh Token: 7일 유효
- 자동 갱신 지원

### Supabase 연동
- Supabase Auth를 통한 사용자 관리
- 계정 삭제 시 Supabase에서도 함께 삭제

## 🛠️ 트러블슈팅

### 서버 연결 실패
- 서버가 포트 8080에서 실행 중인지 확인
- `http://localhost:8080/health`로 직접 접속해서 확인

### 토큰 만료
- `토큰 갱신` API를 사용하거나
- 다시 로그인하여 새로운 토큰 발급

### 환경 변수 문제
- 환경이 `SpartaFinalProject Environment`로 설정되어 있는지 확인
- 필요시 환경 변수를 수동으로 설정

## 📞 지원

문제가 있거나 질문이 있으시면 개발팀에 문의해주세요.

---

**Happy Testing!** 🎉