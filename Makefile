# Makefile for SseudamBackend

.PHONY: help build build-dev build-prod up down logs shell health clean rebuild

# Default target
help: ## Show this help message
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# Development commands (로컬용)
dev: ## Run development build and start
	@chmod +x scripts/*.sh
	@./scripts/build-dev.sh
	@./scripts/compose.sh up -d

build-dev: ## Build development image (local platform only)
	@chmod +x scripts/build-dev.sh
	@./scripts/build-dev.sh

# Production deployment (CI가 자동 처리)
deploy: ## Deploy to production via CI (push to main branch)
	@echo "🚀 Deploying to production..."
	@echo "📦 CI will automatically:"
	@echo "   - Build multi-platform images (AMD64 + ARM64)"
	@echo "   - Push to GitHub Container Registry"
	@echo "   - Run security scans"
	@echo "   - Cache optimization"
	@echo ""
	@echo "✅ Just push to main branch:"
	@echo "   git push origin main"

# Legacy commands (로컬 테스트용 - 일반적으로 사용 안 함)
build-prod: ## [Legacy] Build production image and push to Docker Hub
	@echo "⚠️  Use 'make deploy' instead for production"
	@echo "💡 This requires Docker Hub login and push permissions"
	@read -p "Continue? (y/N): " confirm && [ "$$confirm" = "y" ]
	@chmod +x scripts/build-prod.sh
	@./scripts/build-prod.sh

build-prod-local: ## [Legacy] Build production image locally without push
	@echo "💡 Testing multi-platform build locally..."
	@chmod +x scripts/build-prod-local.sh
	@./scripts/build-prod-local.sh

build: ## Build image with BuildX
	@chmod +x scripts/build.sh
	@./scripts/build.sh

# Docker Compose commands
up: ## Start development services in background
	@docker compose up -d

down: ## Stop services
	@docker compose down

# Production commands
up-prod: ## Start production services
	@docker compose -f docker-compose.prod.yml up -d

down-prod: ## Stop production services
	@docker compose -f docker-compose.prod.yml down

logs: ## Show logs (use 'make logs-f' for follow)
	@chmod +x scripts/compose.sh
	@./scripts/compose.sh logs

logs-f: ## Follow logs
	@chmod +x scripts/compose.sh
	@./scripts/compose.sh logs -f

shell: ## Open shell in API container
	@chmod +x scripts/compose.sh
	@./scripts/compose.sh shell

health: ## Check service health
	@chmod +x scripts/compose.sh
	@./scripts/compose.sh health

rebuild: ## Rebuild and restart services
	@chmod +x scripts/compose.sh
	@./scripts/compose.sh rebuild

clean: ## Clean up Docker resources
	@chmod +x scripts/compose.sh
	@./scripts/compose.sh clean

# BuildX specific commands
buildx-setup: ## Setup BuildX builder
	@docker buildx create --name sseudam-builder --use || true
	@docker buildx inspect --bootstrap

buildx-platforms: ## Show available platforms
	@docker buildx ls

buildx-cache-clean: ## Clean BuildX cache
	@docker buildx prune -f

# Quick commands
start: up ## Alias for 'up'
stop: down ## Alias for 'down'
restart: rebuild ## Alias for 'rebuild'

# Installation
install-deps: ## Install project dependencies
	@npm ci

# Testing (add your test commands here)
test: ## Run tests
	@echo "Add your test commands here"
	@npm test

# Linting
lint: ## Run linter
	@npm run lint || echo "Lint command not found"

# All-in-one commands
setup: install-deps buildx-setup ## Setup development environment
	@echo "✅ Development environment setup complete!"

quick-start: setup build-dev up ## Complete setup and start development
	@echo "🚀 Quick start complete! API running on http://localhost:8080"