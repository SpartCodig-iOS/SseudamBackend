# Vapor Superbase JWT Authentication API

## 📋 Overview

이 API는 Superbase와 연동된 JWT 기반 인증 시스템을 제공합니다.

**기본 URL**: `http://localhost:8080/api/v1`

## 🔐 Authentication Endpoints

### 1. 회원가입 (Sign Up)

**POST** `/auth/signup`

```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "사용자 이름"
}
```

**Response (201 Created):**
```json
{
  "code": 200,
  "message": "Signup successful",
  "data": {
    "user": {
      "id": "uuid-string",
      "email": "user@example.com",
      "username": "user",
      "name": "사용자 이름",
      "avatarURL": null,
      "createdAt": "2025-11-06T01:00:00Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresAt": "2025-11-07T01:00:00Z",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshExpiresAt": "2025-11-13T01:00:00Z",
    "tokenType": "Bearer"
  }
}
```

### 2. 로그인 (Sign In)

**POST** `/auth/login`

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200 OK):**
```json
{
  "code": 200,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid-string",
      "email": "user@example.com",
      "username": "user",
      "name": "사용자 이름",
      "avatarURL": null,
      "createdAt": "2025-11-06T01:00:00Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresAt": "2025-11-07T01:00:00Z",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshExpiresAt": "2025-11-13T01:00:00Z",
    "tokenType": "Bearer"
  }
}
```

### 2-1. 토큰 갱신 (Refresh Token)

**POST** `/auth/refresh`

```json
{
  "refreshToken": "<이전에 발급받은 refreshToken>"
}
```

**Response (200 OK):**
```json
{
  "code": 200,
  "message": "Token refreshed",
  "data": {
    "accessToken": "...",
    "expiresAt": "2025-11-07T01:00:00Z",
    "refreshToken": "...",
    "refreshExpiresAt": "2025-11-13T01:00:00Z",
    "tokenType": "Bearer",
    "user": {
      "id": "uuid-string",
      "email": "user@example.com",
      "username": "user"
    }
  }
}
```

## 👤 Protected Endpoints

### 3. 현재 사용자 정보 (Current User)

**GET** `/auth/me`

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response (200 OK):**
```json
{
  "code": 200,
  "data": {
    "id": "uuid-string",
    "email": "user@example.com",
    "username": "user",
    "name": "사용자 이름",
    "avatarURL": null,
    "createdAt": "2025-11-06T01:00:00Z"
  }
}
```

### 4. 사용자 프로필 (User Profile)

**GET** `/auth/profile`

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response (200 OK):**
```json
{
  "code": 200,
  "data": {
    "id": "uuid-string",
    "email": "user@example.com",
    "username": "user",
    "name": "사용자 이름",
    "avatarURL": null,
    "createdAt": "2025-11-06T01:00:00Z",
    "updatedAt": "2025-11-06T01:00:00Z"
  }
}
```

### 5. 계정 삭제 (Delete Account)

**DELETE** `/auth/profile`

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response (200 OK):**
```json
{
  "code": 200,
  "message": "Account deleted",
  "data": {
    "userID": "uuid-string"
  }
}
```

## 🧪 cURL 테스트 예제

### 회원가입
```bash
curl -X POST http://localhost:8080/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "테스트 사용자"
  }'
```

### 로그인
```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### 토큰 갱신
```bash
curl -X POST http://localhost:8080/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "<refresh token>"
  }'
```

### 계정 삭제
```bash
curl -X DELETE http://localhost:8080/api/v1/auth/profile \
  -H "Authorization: Bearer $TOKEN"
```

### 인증된 요청
```bash
# 위에서 받은 토큰을 사용
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -X GET http://localhost:8080/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

> 로그인 시 `email` 필드에는 이메일 전체 또는 `username`(이메일 @ 앞부분) 둘 중 하나를 넣을 수 있습니다.

## ⚙️ 환경 변수 설정

`.env` 파일 또는 Docker 환경 변수:

```env
# JWT 설정
JWT_SECRET=your-super-secret-jwt-key-here

# Superbase 설정 (실제 값은 로컬 .env에서만 관리)
SUPERBASE_URL=https://your-project-id.superbase.co
SUPERBASE_ANON_KEY=your-superbase-anon-key
SUPERBASE_PROFILE_TABLE=profiles

# 데이터베이스 설정 (Docker Compose에서 자동 설정)
DATABASE_HOST=db
DATABASE_NAME=vapor_database
DATABASE_USERNAME=vapor_username
DATABASE_PASSWORD=vapor_password
```

## 🔧 기능

- ✅ **Superbase 연동**: 사용자 인증과 데이터 동기화
- ✅ **JWT 토큰**: 24시간 유효한 Bearer 토큰 + 7일 유효한 Refresh 토큰
- ✅ **비밀번호 해싱**: Bcrypt를 사용한 안전한 저장
- ✅ **입력 검증**: 이메일 형식 및 비밀번호 길이 검증
- ✅ **에러 처리**: 상세한 에러 메시지와 HTTP 상태 코드
- ✅ **PostgreSQL**: Fluent ORM을 통한 데이터베이스 연동

## 🚨 에러 응답 예제

### 401 Unauthorized
```json
{
  "error": true,
  "reason": "Invalid email or password"
}
```

### 409 Conflict
```json
{
  "error": true,
  "reason": "User with this email already exists"
}
```

### 422 Validation Error
```json
{
  "error": true,
  "reason": "email is not a valid email address"
}
```
