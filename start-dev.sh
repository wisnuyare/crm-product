#!/bin/bash

# WhatsApp CRM - Development Environment Startup Script

set -e

echo "🚀 Starting WhatsApp CRM Development Environment..."
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker first."
  exit 1
fi

echo "✅ Docker is running"
echo ""

# Navigate to docker directory
cd infrastructure/docker

# Create .env if it doesn't exist
if [ ! -f ../../.env ]; then
  echo "📝 Creating .env file from template..."
  cp ../../.env.example ../../.env
  echo "⚠️  Please edit .env with your credentials before continuing"
  echo ""
fi

# Start infrastructure services
echo "🏗️  Starting infrastructure services (PostgreSQL, Redis, Pub/Sub, Qdrant)..."
docker-compose up -d postgres redis pubsub-emulator qdrant

# Wait for PostgreSQL to be healthy
echo "⏳ Waiting for PostgreSQL to be ready..."
until docker-compose exec -T postgres pg_isready -U crm_user -d crm_dev > /dev/null 2>&1; do
  echo "   Still waiting for PostgreSQL..."
  sleep 2
done

echo "✅ PostgreSQL is ready"
echo ""

# Wait for Redis to be healthy
echo "⏳ Waiting for Redis to be ready..."
until docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; do
  echo "   Still waiting for Redis..."
  sleep 1
done

echo "✅ Redis is ready"
echo ""

# Build and start microservices
echo "🔨 Building and starting microservices..."
docker-compose up -d --build tenant-service

echo ""
echo "🎉 Development environment is ready!"
echo ""
echo "📊 Services:"
echo "   - PostgreSQL:      http://localhost:5432"
echo "   - Redis:           http://localhost:6379"
echo "   - Pub/Sub Emulator: http://localhost:8085"
echo "   - Qdrant:          http://localhost:6333"
echo "   - Tenant Service:  http://localhost:3001"
echo ""
echo "📚 API Documentation:"
echo "   - Tenant Service:  http://localhost:3001/api/docs"
echo ""
echo "🔍 View logs:"
echo "   docker-compose logs -f tenant-service"
echo ""
echo "🛑 Stop all services:"
echo "   docker-compose down"
echo ""
