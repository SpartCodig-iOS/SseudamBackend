# 🚀 CI/CD 기반 배포 가이드

BuildX의 진정한 파워는 CI 환경에서 발휘됩니다!

## 🎯 **배포 전략**

### 🏠 **로컬 개발** (간단하고 빠르게)
```bash
# 개발 환경 시작
make dev

# 로그 확인
make logs-f

# 컨테이너 접속
make shell
```

### 🏭 **프로덕션 배포** (CI가 자동 처리)
```bash
# 1. 코드 커밋
git add .
git commit -m "feat: 새로운 기능 추가"

# 2. main 브랜치에 푸시 (CI 자동 트리거)
git push origin main

# 3. CI가 자동으로:
#   ✅ 멀티 플랫폼 빌드 (AMD64 + ARM64)
#   ✅ GitHub Container Registry 푸시
#   ✅ 보안 스캔 (Trivy)
#   ✅ 캐시 최적화
```

## 🔄 **CI 파이프라인 상세**

### **트리거 조건**
- `main` 브랜치 푸시 → 프로덕션 빌드 + 푸시
- `develop` 브랜치 푸시 → 개발 빌드 + 푸시
- 태그 푸시 (`v1.0.0`) → 릴리즈 빌드
- PR 생성 → 테스트 빌드 (푸시 안 함)

### **자동 처리 과정**
1. **코드 체크아웃**
2. **Docker BuildX 설정**
   - `docker-container` driver 사용
   - 멀티 플랫폼 지원 활성화
3. **GitHub Container Registry 로그인**
4. **메타데이터 추출**
   - 브랜치명, 커밋 SHA, 태그 정보
5. **멀티 플랫폼 빌드**
   ```yaml
   platforms: linux/amd64,linux/arm64
   cache-from: type=gha  # GitHub Actions 캐시
   cache-to: type=gha,mode=max
   ```
6. **자동 푸시**
   ```bash
   ghcr.io/suhwonji/sseudambackend:main-abc1234
   ghcr.io/suhwonji/sseudambackend:latest
   ```
7. **보안 스캔** (Trivy)
8. **결과 리포트**

## 📦 **빌드된 이미지 확인**

### **GitHub Container Registry**
- 저장소: `ghcr.io/suhwonji/sseudambackend`
- 태그 예시:
  ```bash
  ghcr.io/suhwonji/sseudambackend:main      # main 브랜치
  ghcr.io/suhwonji/sseudambackend:develop   # develop 브랜치
  ghcr.io/suhwonji/sseudambackend:v1.0.0    # 릴리즈 태그
  ghcr.io/suhwonji/sseudambackend:main-abc1234 # 커밋 SHA
  ```

### **이미지 사용**
```bash
# 최신 프로덕션 이미지 실행
docker run -p 8080:8080 ghcr.io/suhwonji/sseudambackend:main

# 특정 버전 실행
docker run -p 8080:8080 ghcr.io/suhwonji/sseudambackend:v1.0.0
```

## 🔧 **CI 설정 커스터마이징**

### **새로운 브랜치 추가**
`.github/workflows/docker-build.yml`:
```yaml
on:
  push:
    branches: [ main, develop, staging ]  # staging 추가
```

### **커스텀 태그 전략**
```yaml
tags: |
  type=ref,event=branch
  type=semver,pattern={{version}}
  type=semver,pattern={{major}}.{{minor}}
  type=raw,value=latest,enable={{is_default_branch}}
```

### **빌드 시간 최적화**
```yaml
cache-from: |
  type=gha
  type=registry,ref=ghcr.io/${{ github.repository }}:cache
cache-to: |
  type=gha,mode=max
  type=registry,ref=ghcr.io/${{ github.repository }}:cache,mode=max
```

## 📊 **성능 비교**

| 환경 | 빌드 시간 | 캐시 효율 | 멀티 플랫폼 | 자동화 |
|------|-----------|-----------|-------------|---------|
| 로컬 | ~15분 | 제한적 | 어려움 | 수동 |
| CI | ~3분 | 최적화 | ✅ 완벽 | ✅ 자동 |

## 🎯 **권장 워크플로우**

### **일상 개발**
```bash
# 로컬에서 개발 & 테스트
make dev
make logs-f

# 기능 완성 후 푸시
git push origin feature/new-feature
```

### **릴리즈**
```bash
# develop → main 머지
git checkout main
git merge develop

# 태그 생성 & 푸시
git tag v1.0.0
git push origin main --tags

# CI가 자동으로 릴리즈 빌드 & 배포
```

### **핫픽스**
```bash
# 긴급 수정
git checkout -b hotfix/critical-bug
git commit -m "fix: critical security issue"
git checkout main
git merge hotfix/critical-bug
git push origin main  # 즉시 CI 배포
```

## 🔍 **CI 모니터링**

### **GitHub Actions 확인**
1. 저장소 → `Actions` 탭
2. 빌드 상태 및 로그 확인
3. 빌드 실패시 원인 분석

### **이미지 확인**
1. 저장소 → `Packages` 탭
2. Container images 목록
3. 다운로드 통계

### **보안 스캔 결과**
1. 저장소 → `Security` 탭
2. Code scanning alerts
3. Dependency alerts

## 🚀 **다음 단계**

1. **쿠버네티스 배포** 설정
2. **스테이징 환경** 자동 배포
3. **성능 테스트** 자동화
4. **슬랙 알림** 연동

이제 로컬은 개발만, 배포는 CI가 완전 자동으로 처리합니다! 🎉