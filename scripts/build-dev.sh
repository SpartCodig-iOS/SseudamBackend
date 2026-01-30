#!/bin/bash

# Development build script - 로컬 플랫폼만 빌드

set -e

echo "🔧 Development build (local platform only)..."
./scripts/build.sh --local-only --name sseudam-backend --tag dev

echo "✅ Development build complete!"
echo "Run with: docker run -p 8080:8080 sseudam-backend:dev"