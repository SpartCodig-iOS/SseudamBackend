#!/bin/bash

# Production build script - multi-platform 빌드 및 푸시

set -e

# Get version from package.json or use latest
if command -v jq >/dev/null 2>&1; then
    VERSION=$(cat package.json | jq -r '.version')
else
    VERSION="latest"
fi

echo "🚀 Production build (multi-platform) - Version: $VERSION"

./scripts/build.sh \
    --name sseudam-backend \
    --tag "$VERSION" \
    --platforms linux/amd64,linux/arm64 \
    --push

echo "✅ Production build complete!"
echo "Image: sseudam-backend:$VERSION"