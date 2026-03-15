#!/bin/bash

# ================================
# 🚀 SseudamBackend Docker Startup
# ================================

set -e

echo "📊 Starting BullMQ Dashboard Environment..."

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo "❌ Error: Docker is not running. Please start Docker first."
    exit 1
fi

# Create network if it doesn't exist
docker network create sseudam-network 2>/dev/null || true

# Load environment variables
if [ -f "docker/.env.docker" ]; then
    echo "📋 Loading environment variables..."
    export $(cat docker/.env.docker | grep -v '#' | xargs)
fi

# Start services
echo "🐳 Starting Docker services..."
docker-compose -f docker/docker-compose.yml up -d

echo "⏳ Waiting for services to be ready..."

# Wait for PostgreSQL
until docker exec sseudam-postgres pg_isready -U postgres; do
    echo "⏳ Waiting for PostgreSQL..."
    sleep 2
done

# Wait for Redis
until docker exec sseudam-redis redis-cli ping; do
    echo "⏳ Waiting for Redis..."
    sleep 2
done

echo "✅ All services are ready!"
echo ""
echo "📊 Service URLs:"
echo "  📊 BullMQ Dashboard: http://localhost:3001"
echo "  🔴 Redis Commander: http://localhost:8081 (admin/admin123)"
echo "  📋 Health Check:    http://localhost:3001/health"
echo ""
echo "📋 Redis Connection:"
echo "  Host: localhost"
echo "  Port: 6379"
echo "  Password: (none)"
echo ""
echo "🎯 To stop services: docker-compose -f docker/docker-compose.yml down"