#!/bin/bash

# Production build script - 로컬 테스트용 (푸시 없음)

set -e

# Get version from package.json or use latest
if command -v jq >/dev/null 2>&1; then
    VERSION=$(cat package.json | jq -r '.version')
else
    VERSION="latest"
fi

echo "🚀 Production build (multi-platform, local only) - Version: $VERSION"

./scripts/build.sh \
    --name sseudam-backend \
    --tag "$VERSION" \
    --platforms linux/amd64,linux/arm64
    # --push 제거됨

echo "✅ Production build complete (local only)!"
echo "Image: sseudam-backend:$VERSION"