@echo off
REM Test Script for Quota Tracking System (Windows)
REM This script tests the quota system without authentication

echo ==========================================
echo 🧪 Quota System Testing Script (Windows)
echo ==========================================
echo.

set BASE_URL=http://localhost:3001/api/v1

REM Test 1: Health Check
echo [Test 1] Health Check
echo GET %BASE_URL%/../health
curl -s "%BASE_URL%/../health"
echo.
echo ✅ Test 1 Complete
echo.

REM Test 2: Get Subscription Tiers
echo [Test 2] Get Subscription Tiers
echo GET %BASE_URL%/quota/tiers
curl -s "%BASE_URL%/quota/tiers"
echo.
echo ✅ Test 2 Complete
echo.

REM Test 3: Get Test Tenant by Slug (Public)
echo [Test 3] Get Test Tenant
echo GET %BASE_URL%/tenants/slug/test-tenant-1
curl -s "%BASE_URL%/tenants/slug/test-tenant-1"
echo.
echo ✅ Test 3 Complete
echo.

REM Test 4: Get Second Test Tenant
echo [Test 4] Get Second Test Tenant
echo GET %BASE_URL%/tenants/slug/test-tenant-2
curl -s "%BASE_URL%/tenants/slug/test-tenant-2"
echo.
echo ✅ Test 4 Complete
echo.

echo ==========================================
echo ℹ️  Authenticated Tests
echo ==========================================
echo.
echo To run authenticated tests, you need a JWT token.
echo See QUICK_START.md for instructions on setting up Firebase Auth.
echo.
echo Once you have a token, you can test with:
echo   curl -H "Authorization: Bearer YOUR_TOKEN" %BASE_URL%/quota/status
echo.

echo ==========================================
echo ✅ Basic Tests Complete!
echo ==========================================
pause
