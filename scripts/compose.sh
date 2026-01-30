#!/bin/bash

# Docker Compose 관리 스크립트

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

show_help() {
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  up                      Start services"
    echo "  down                    Stop services"
    echo "  build                   Build services with BuildX"
    echo "  rebuild                 Rebuild and restart services"
    echo "  logs                    Show logs"
    echo "  shell                   Open shell in api container"
    echo "  health                  Check service health"
    echo "  clean                   Clean up containers, volumes, and images"
    echo ""
    echo "Options:"
    echo "  -d, --detach           Run in background (for up command)"
    echo "  -f, --follow           Follow logs (for logs command)"
    echo "  -h, --help             Show this help"
}

# Ensure .env file exists
check_env() {
    if [[ ! -f .env ]]; then
        echo -e "${YELLOW}⚠️  .env file not found. Creating from .env.example...${NC}"
        if [[ -f .env.example ]]; then
            cp .env.example .env
            echo -e "${GREEN}✅ Created .env file${NC}"
        else
            echo -e "${RED}❌ .env.example not found. Please create .env manually${NC}"
            exit 1
        fi
    fi
}

# Start services
compose_up() {
    local detach=""
    if [[ "$1" == "--detach" || "$1" == "-d" ]]; then
        detach="-d"
    fi

    echo -e "${BLUE}🚀 Starting services...${NC}"
    check_env
    docker compose up $detach
}

# Stop services
compose_down() {
    echo -e "${YELLOW}🛑 Stopping services...${NC}"
    docker compose down
}

# Build services
compose_build() {
    echo -e "${BLUE}🔨 Building services with BuildX...${NC}"
    check_env
    DOCKER_BUILDKIT=1 docker compose build --progress=plain
}

# Rebuild and restart
compose_rebuild() {
    echo -e "${BLUE}🔄 Rebuilding and restarting services...${NC}"
    docker compose down
    DOCKER_BUILDKIT=1 docker compose build --no-cache --progress=plain
    docker compose up -d
}

# Show logs
compose_logs() {
    local follow=""
    if [[ "$1" == "--follow" || "$1" == "-f" ]]; then
        follow="-f"
    fi

    docker compose logs $follow
}

# Open shell
compose_shell() {
    echo -e "${BLUE}🐚 Opening shell in api container...${NC}"
    docker compose exec api sh
}

# Health check
compose_health() {
    echo -e "${BLUE}🏥 Checking service health...${NC}"
    docker compose ps
    echo ""

    # Check if API is responding
    if curl -s http://localhost:8080/health >/dev/null 2>&1; then
        echo -e "${GREEN}✅ API is healthy${NC}"
    else
        echo -e "${RED}❌ API is not responding${NC}"
    fi
}

# Clean up
compose_clean() {
    echo -e "${YELLOW}🧹 Cleaning up Docker resources...${NC}"

    # Stop and remove containers
    docker compose down --remove-orphans

    # Remove unused images
    echo "Removing unused images..."
    docker image prune -f

    # Remove unused volumes
    echo "Removing unused volumes..."
    docker volume prune -f

    # Remove build cache
    echo "Removing build cache..."
    docker buildx prune -f

    echo -e "${GREEN}✅ Cleanup complete${NC}"
}

# Main command processing
case ${1:-help} in
    up)
        compose_up "$2"
        ;;
    down)
        compose_down
        ;;
    build)
        compose_build
        ;;
    rebuild)
        compose_rebuild
        ;;
    logs)
        compose_logs "$2"
        ;;
    shell)
        compose_shell
        ;;
    health)
        compose_health
        ;;
    clean)
        compose_clean
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo -e "${RED}❌ Unknown command: $1${NC}"
        show_help
        exit 1
        ;;
esac