#!/bin/bash
# Test Script for Quota Tracking System
# This script tests the entire quota system end-to-end

set -e  # Exit on error

echo "=========================================="
echo "🧪 Quota System Testing Script"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:3001/api/v1"

# Test 1: Health Check
echo -e "${YELLOW}Test 1: Health Check${NC}"
echo "GET $BASE_URL/../health"
curl -s "$BASE_URL/../health" | jq '.' || echo "❌ Health check failed"
echo ""
echo "✅ Test 1 Complete"
echo ""

# Test 2: Get Subscription Tiers (Public)
echo -e "${YELLOW}Test 2: Get Subscription Tiers${NC}"
echo "GET $BASE_URL/quota/tiers"
curl -s "$BASE_URL/quota/tiers" | jq '.' || echo "❌ Failed"
echo ""
echo "✅ Test 2 Complete"
echo ""

# Test 3: Get Tenant by Slug (Public endpoint for testing)
echo -e "${YELLOW}Test 3: Get Test Tenant${NC}"
echo "GET $BASE_URL/tenants/slug/test-tenant-1"
TENANT_RESPONSE=$(curl -s "$BASE_URL/tenants/slug/test-tenant-1")
echo "$TENANT_RESPONSE" | jq '.'
TENANT_ID=$(echo "$TENANT_RESPONSE" | jq -r '.id')
echo "Tenant ID: $TENANT_ID"
echo ""
echo "✅ Test 3 Complete"
echo ""

# Note: For authenticated tests, you need a valid JWT token
# The following tests are examples and will fail without authentication

echo -e "${YELLOW}=========================================="
echo "Authenticated Tests (Require JWT Token)"
echo "==========================================${NC}"
echo ""
echo "To run authenticated tests, you need to:"
echo "1. Set up Firebase Authentication"
echo "2. Generate a JWT token with custom claims:"
echo "   - tenant_id: $TENANT_ID"
echo "   - role: admin"
echo "3. Export the token: export JWT_TOKEN='your-token-here'"
echo "4. Run the authenticated tests"
echo ""

# Check if JWT_TOKEN is set
if [ -z "$JWT_TOKEN" ]; then
    echo -e "${RED}⚠️  JWT_TOKEN not set. Skipping authenticated tests.${NC}"
    echo ""
    echo "To test with authentication:"
    echo "  export JWT_TOKEN='your-jwt-token'"
    echo "  ./test-quota-system.sh"
    exit 0
fi

echo -e "${GREEN}JWT_TOKEN is set. Running authenticated tests...${NC}"
echo ""

# Test 4: Get Quota Status (Authenticated)
echo -e "${YELLOW}Test 4: Get Quota Status${NC}"
echo "GET $BASE_URL/quota/status"
curl -s -H "Authorization: Bearer $JWT_TOKEN" "$BASE_URL/quota/status" | jq '.' || echo "❌ Failed"
echo ""
echo "✅ Test 4 Complete"
echo ""

# Test 5: Check Message Quota (Authenticated)
echo -e "${YELLOW}Test 5: Check Message Quota${NC}"
echo "POST $BASE_URL/quota/check/message"
curl -s -X POST -H "Authorization: Bearer $JWT_TOKEN" "$BASE_URL/quota/check/message" | jq '.' || echo "❌ Failed"
echo ""
echo "✅ Test 5 Complete"
echo ""

# Test 6: Check Outlet Limit (Authenticated - Admin only)
echo -e "${YELLOW}Test 6: Check Outlet Limit${NC}"
echo "POST $BASE_URL/quota/check/outlet"
curl -s -X POST -H "Authorization: Bearer $JWT_TOKEN" "$BASE_URL/quota/check/outlet" | jq '.' || echo "❌ Failed"
echo ""
echo "✅ Test 6 Complete"
echo ""

# Test 7: Record Message Usage (Authenticated - Admin only)
echo -e "${YELLOW}Test 7: Record Message Usage${NC}"
echo "POST $BASE_URL/quota/usage/messages"
curl -s -X POST \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"count": 5}' \
  "$BASE_URL/quota/usage/messages" | jq '.' || echo "❌ Failed"
echo ""
echo "✅ Test 7 Complete"
echo ""

# Test 8: Get Usage History (Authenticated)
echo -e "${YELLOW}Test 8: Get Usage History${NC}"
echo "GET $BASE_URL/quota/usage/history?type=messages&limit=6"
curl -s -H "Authorization: Bearer $JWT_TOKEN" "$BASE_URL/quota/usage/history?type=messages&limit=6" | jq '.' || echo "❌ Failed"
echo ""
echo "✅ Test 8 Complete"
echo ""

# Test 9: Try to Create Outlet (should check quota first)
echo -e "${YELLOW}Test 9: Create Outlet (Quota Check)${NC}"
echo "POST $BASE_URL/outlets"
curl -s -X POST \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "'$TENANT_ID'",
    "name": "Test Outlet",
    "wabaPhoneNumber": "+628123456789",
    "wabaPhoneNumberId": "test_phone_id",
    "wabaBusinessAccountId": "test_business_id",
    "wabaAccessToken": "test_token"
  }' \
  "$BASE_URL/outlets" | jq '.' || echo "Expected to fail if quota exceeded"
echo ""
echo "✅ Test 9 Complete"
echo ""

echo -e "${GREEN}=========================================="
echo "✅ All Tests Complete!"
echo "==========================================${NC}"
