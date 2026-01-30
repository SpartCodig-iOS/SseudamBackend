# Docker BuildX 가이드

이 프로젝트는 Docker BuildX를 활용하여 최적화된 컨테이너 이미지 빌드를 지원합니다.

## 🚀 Quick Start

```bash
# 개발 환경 설정 및 시작
make quick-start

# 또는 개별 명령어
make setup          # 환경 설정
make build-dev      # 개발용 빌드
make up             # 서비스 시작
```

## 📦 빌드 명령어

### 개발용 빌드 (로컬 플랫폼)
```bash
make build-dev
# 또는
./scripts/build-dev.sh
```

### 프로덕션 빌드 (멀티 플랫폼)
```bash
make build-prod
# 또는
./scripts/build-prod.sh
```

### 커스텀 빌드
```bash
# 특정 플랫폼만
./scripts/build.sh --platforms linux/amd64

# 레지스트리에 푸시
./scripts/build.sh --push

# 캐시 비활성화
./scripts/build.sh --no-cache
```

## 🐳 Docker Compose 명령어

```bash
make up             # 서비스 시작
make down           # 서비스 중지
make logs           # 로그 확인
make logs-f         # 로그 실시간 확인
make shell          # 컨테이너 쉘 접속
make health         # 헬스 체크
make rebuild        # 재빌드 및 재시작
make clean          # 리소스 정리
```

## 🔧 BuildX 기능

### 멀티 플랫폼 지원
- `linux/amd64` (Intel/AMD x64)
- `linux/arm64` (Apple Silicon, ARM64 서버)

### 캐시 최적화
- npm 패키지 캐시 마운트
- BuildKit 인라인 캐시
- GitHub Actions 캐시 (CI/CD)

### 보안 강화
- Non-root 사용자로 실행
- 최소한의 런타임 이미지 (Alpine)
- 헬스 체크 내장

## 🏗️ BuildX 빌더 관리

```bash
# 빌더 설정
make buildx-setup

# 사용 가능한 플랫폼 확인
make buildx-platforms

# BuildX 캐시 정리
make buildx-cache-clean
```

## 📊 성능 최적화

1. **레이어 캐싱**: 자주 변경되지 않는 의존성을 먼저 복사
2. **멀티 스테이지 빌드**: 빌드와 런타임 분리
3. **캐시 마운트**: npm 캐시 재사용
4. **최소 이미지**: Alpine 기반 런타임

## 🔒 보안 기능

- 컨테이너 스캔 (Trivy)
- Non-root 실행
- 최소 권한 원칙
- 보안 업데이트

## 🚀 CI/CD 통합

GitHub Actions에서 자동으로:
- 멀티 플랫폼 빌드
- 레지스트리 푸시
- 보안 스캔
- 캐시 최적화

## 📝 사용 예시

### 로컬 개발
```bash
# 개발 환경 시작
make dev

# 로그 확인
make logs-f

# 컨테이너 접속
make shell
```

### 프로덕션 배포
```bash
# 프로덕션 이미지 빌드 및 푸시
make build-prod

# 태그 확인
docker images sseudam-backend
```

## 🆘 문제 해결

### 빌드 실패 시
```bash
# 캐시 정리 후 재빌드
make clean
make rebuild
```

### BuildX 관련 문제
```bash
# BuildX 재설정
docker buildx rm sseudam-builder
make buildx-setup
```

### 권한 문제
```bash
# 스크립트 권한 확인
chmod +x scripts/*.sh
```