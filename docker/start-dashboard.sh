#!/bin/bash

# ================================
# 📊 BullMQ Dashboard Startup Script
# ================================

set -e

echo "📊 Starting BullMQ Dashboard..."

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo "❌ Error: Docker is not running. Please start Docker first."
    exit 1
fi

# Create network if it doesn't exist
docker network create sseudam-dashboard-network 2>/dev/null || true

# Start BullMQ Dashboard services
echo "🐳 Starting BullMQ Dashboard services..."
docker-compose -f docker/docker-compose.yml up -d

echo "⏳ Waiting for services to be ready..."

# Wait for Redis
until docker exec sseudam-redis-dashboard redis-cli ping; do
    echo "⏳ Waiting for Redis..."
    sleep 2
done

# Wait for Bull Dashboard
until curl -f http://localhost:3001/health &>/dev/null; do
    echo "⏳ Waiting for BullMQ Dashboard..."
    sleep 2
done

echo "✅ BullMQ Dashboard is ready!"
echo ""
echo "📊 Service URLs:"
echo "  📊 BullMQ Dashboard: http://localhost:3001"
echo "  🔴 Redis Commander:  http://localhost:8081 (admin/admin123)"
echo "  📋 Health Check:     http://localhost:3001/health"
echo ""
echo "📋 Redis Connection:"
echo "  Host: localhost"
echo "  Port: 6379"
echo "  Password: (none)"
echo ""
echo "🎯 To stop services: docker-compose -f docker/docker-compose.yml down"
echo "🎯 To view logs: docker-compose -f docker/docker-compose.yml logs -f"