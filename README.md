# VaporDockerApp

💧 JWT Authentication API with Supabase Integration

## 🚀 **Production**
- **API Base URL**: https://finalprojectsever.onrender.com
- **Swagger UI**: https://finalprojectsever.onrender.com/docs
- **OpenAPI Spec**: https://finalprojectsever.onrender.com/openapi.json
- **Test Account**: `test@test.com` / `test123!`

> 💡 **Swagger UI에서 서버 선택**: 우상단 드롭다운에서 `https://finalprojectsever.onrender.com` (프로덕션) 또는 `http://localhost:8080` (로컬) 선택 가능

## 🎯 **Quick Test**
```bash
# Login
curl -X POST https://finalprojectsever.onrender.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@test.com", "password": "test123!"}'

# Get User (use token from login response)
curl -X GET https://finalprojectsever.onrender.com/api/v1/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 🛠 **Local Development**

### 🔄 **Hybrid Development Mode** (로컬 ↔ Supabase 동기화)
로컬 개발 환경에서 새로 생성된 사용자가 자동으로 Supabase Auth와 Profiles에 동기화됩니다.

```bash
# 1. 로컬 데이터베이스 시작
docker compose up db -d

# 2. 마이그레이션 실행
docker compose run migrate

# 3. 앱 시작 (Supabase 동기화 활성화)
docker compose up app
```

**동기화 흐름:**
- 로컬 회원가입 → Local PostgreSQL + Supabase Auth + Supabase Profiles
- 로컬에서 생성한 계정으로 프로덕션 환경에서도 로그인 가능
- 개발/테스트 시 데이터 일관성 보장

### 📦 **Swift 직접 실행**
```bash
swift build && swift run
```

## 📋 **API Endpoints**
- `POST /api/v1/auth/signup` - 회원가입
- `POST /api/v1/auth/login` - 로그인
- `POST /api/v1/auth/refresh` - 토큰 갱신
- `GET /api/v1/auth/me` - 사용자 정보
- `GET /api/v1/auth/profile` - 프로필 조회
- `DELETE /api/v1/auth/profile` - 계정 삭제
- `GET /health` - 상태 확인

## ⚙️ **Environment Variables**
```bash
# JWT
JWT_SECRET=your-secret-key

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-service-role-key
SUPABASE_DB_URL=postgresql://postgres.your-project:password@aws.pooler.supabase.net:5432/postgres

# Local DB (development only)
DATABASE_HOST=db
DATABASE_NAME=vapor_database
DATABASE_USERNAME=vapor_username
DATABASE_PASSWORD=vapor_password
```

## 🗂 **Project Structure**
- **Development**: Local PostgreSQL + JWT
- **Production**: Supabase Auth + Database + JWT
- **Deployment**: Render.com with automated CI/CD

---

**Built with**: [Vapor](https://vapor.codes) • [Supabase](https://supabase.com) • [Render](https://render.com)
