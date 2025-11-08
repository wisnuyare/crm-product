#!/bin/bash

# Test script for all 7 microservices
# Usage: ./test-services.sh

set -e

echo "=========================================="
echo "🧪 CRM Platform - Service Testing Suite"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Service health endpoints
declare -A SERVICES=(
    ["tenant-service"]="http://localhost:3001/health"
    ["billing-service"]="http://localhost:3002/health"
    ["knowledge-service"]="http://localhost:3003/health"
    ["conversation-service"]="http://localhost:3004/health"
    ["llm-orchestration-service"]="http://localhost:3005/health"
    ["message-sender-service"]="http://localhost:3006/health"
    ["analytics-service"]="http://localhost:3007/health"
)

# Function to test health endpoint
test_health() {
    local service_name=$1
    local url=$2

    echo -n "Testing ${service_name}... "

    response=$(curl -s -w "\n%{http_code}" "$url" 2>/dev/null || echo "000")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✓ OK${NC} (HTTP $http_code)"
        return 0
    else
        echo -e "${RED}✗ FAILED${NC} (HTTP $http_code)"
        return 1
    fi
}

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 5
echo ""

# Test all services
echo "📡 Testing Health Endpoints:"
echo "=========================================="

passed=0
failed=0

for service in "${!SERVICES[@]}"; do
    if test_health "$service" "${SERVICES[$service]}"; then
        ((passed++))
    else
        ((failed++))
    fi
done

echo ""
echo "=========================================="
echo "📊 Test Summary:"
echo "=========================================="
echo -e "Passed: ${GREEN}$passed${NC}"
echo -e "Failed: ${RED}$failed${NC}"
echo "Total:  $((passed + failed))"
echo ""

# Infrastructure checks
echo "=========================================="
echo "🔧 Infrastructure Status:"
echo "=========================================="

echo -n "PostgreSQL... "
if docker exec crm-postgres pg_isready -U crm_user -d crm_dev > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Running${NC}"
else
    echo -e "${RED}✗ Not Ready${NC}"
fi

echo -n "Redis... "
if docker exec crm-redis redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Running${NC}"
else
    echo -e "${RED}✗ Not Ready${NC}"
fi

echo -n "Qdrant... "
if curl -s http://localhost:6333/healthz > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Running${NC}"
else
    echo -e "${RED}✗ Not Ready${NC}"
fi

echo ""
echo "=========================================="
echo "🐳 Docker Container Status:"
echo "=========================================="
docker-compose ps

echo ""
if [ $failed -eq 0 ]; then
    echo -e "${GREEN}✓ All services are healthy!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some services failed health checks${NC}"
    exit 1
fi
