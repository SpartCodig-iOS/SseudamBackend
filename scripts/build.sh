#!/bin/bash

# Docker BuildX 빌드 스크립트

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
IMAGE_NAME="sseudam-backend"
TAG="latest"
PLATFORMS="linux/amd64,linux/arm64"
PUSH=false
CACHE=true

# Help function
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -n, --name IMAGE_NAME    Docker image name (default: sseudam-backend)"
    echo "  -t, --tag TAG           Docker image tag (default: latest)"
    echo "  -p, --platforms PLATFORMS  Target platforms (default: linux/amd64,linux/arm64)"
    echo "  --push                  Push to registry after build"
    echo "  --no-cache              Disable cache"
    echo "  --local-only            Build for local platform only"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                                           # Basic build"
    echo "  $0 --push                                   # Build and push"
    echo "  $0 --local-only                            # Local build only"
    echo "  $0 -n myapp -t v1.0.0 --push              # Custom name and tag with push"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--name)
            IMAGE_NAME="$2"
            shift 2
            ;;
        -t|--tag)
            TAG="$2"
            shift 2
            ;;
        -p|--platforms)
            PLATFORMS="$2"
            shift 2
            ;;
        --push)
            PUSH=true
            shift
            ;;
        --no-cache)
            CACHE=false
            shift
            ;;
        --local-only)
            PLATFORMS=""
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

# Function to check if buildx is available
check_buildx() {
    if ! docker buildx version >/dev/null 2>&1; then
        echo -e "${RED}❌ Docker BuildX is not available${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Docker BuildX is available${NC}"
}

# Function to ensure builder exists
ensure_builder() {
    local builder_name="sseudam-builder"

    if ! docker buildx inspect "$builder_name" >/dev/null 2>&1; then
        echo -e "${YELLOW}🔨 Creating new builder: $builder_name${NC}"
        docker buildx create --name "$builder_name" --use
        docker buildx inspect --bootstrap
    else
        echo -e "${GREEN}✅ Using existing builder: $builder_name${NC}"
        docker buildx use "$builder_name"
    fi
}

# Function to build image
build_image() {
    local full_image_name="${IMAGE_NAME}:${TAG}"
    local build_args=""

    echo -e "${BLUE}🚀 Building Docker image: $full_image_name${NC}"

    # Prepare build arguments
    if [[ "$PLATFORMS" != "" ]]; then
        build_args="$build_args --platform $PLATFORMS"
    fi

    if [[ "$PUSH" == true ]]; then
        build_args="$build_args --push"
    else
        if [[ "$PLATFORMS" == "" ]]; then
            build_args="$build_args --load"
        fi
    fi

    if [[ "$CACHE" == true ]]; then
        build_args="$build_args --cache-from type=local,src=/tmp/.buildx-cache"
        build_args="$build_args --cache-to type=local,dest=/tmp/.buildx-cache-new,mode=max"
    fi

    # Execute build
    echo -e "${YELLOW}📦 Build command: docker buildx build $build_args -t $full_image_name .${NC}"

    if docker buildx build $build_args -t "$full_image_name" .; then
        echo -e "${GREEN}✅ Build completed successfully!${NC}"

        # Rotate cache
        if [[ "$CACHE" == true ]]; then
            rm -rf /tmp/.buildx-cache
            mv /tmp/.buildx-cache-new /tmp/.buildx-cache || true
        fi

        if [[ "$PUSH" == true ]]; then
            echo -e "${GREEN}✅ Image pushed to registry${NC}"
        elif [[ "$PLATFORMS" == "" ]]; then
            echo -e "${GREEN}✅ Image loaded to local Docker${NC}"
        fi
    else
        echo -e "${RED}❌ Build failed${NC}"
        exit 1
    fi
}

# Main execution
main() {
    echo -e "${BLUE}🐳 Docker BuildX Build Script${NC}"
    echo -e "${BLUE}===============================${NC}"

    check_buildx

    if [[ "$PLATFORMS" != "" ]]; then
        ensure_builder
    fi

    build_image

    echo -e "${GREEN}🎉 All done!${NC}"
}

# Run main function
main