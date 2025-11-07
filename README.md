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
```bash
# Docker (권장)
docker compose up db -d
docker compose run migrate
docker compose up app

# Swift 직접 실행
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
