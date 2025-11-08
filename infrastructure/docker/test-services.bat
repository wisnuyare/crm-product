@echo off
REM Test script for all 7 microservices (Windows)
REM Usage: test-services.bat

echo ==========================================
echo CRM Platform - Service Testing Suite
echo ==========================================
echo.

echo Waiting for services to start...
timeout /t 5 /nobreak > nul
echo.

echo Testing Health Endpoints:
echo ==========================================

set PASSED=0
set FAILED=0

REM Test Tenant Service
echo Testing tenant-service...
curl -s http://localhost:3001/health > nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] tenant-service
    set /a PASSED+=1
) else (
    echo [FAILED] tenant-service
    set /a FAILED+=1
)

REM Test Billing Service
echo Testing billing-service...
curl -s http://localhost:3002/health > nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] billing-service
    set /a PASSED+=1
) else (
    echo [FAILED] billing-service
    set /a FAILED+=1
)

REM Test Knowledge Service
echo Testing knowledge-service...
curl -s http://localhost:3003/health > nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] knowledge-service
    set /a PASSED+=1
) else (
    echo [FAILED] knowledge-service
    set /a FAILED+=1
)

REM Test Conversation Service
echo Testing conversation-service...
curl -s http://localhost:3004/health > nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] conversation-service
    set /a PASSED+=1
) else (
    echo [FAILED] conversation-service
    set /a FAILED+=1
)

REM Test LLM Orchestration Service
echo Testing llm-orchestration-service...
curl -s http://localhost:3005/health > nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] llm-orchestration-service
    set /a PASSED+=1
) else (
    echo [FAILED] llm-orchestration-service
    set /a FAILED+=1
)

REM Test Message Sender Service
echo Testing message-sender-service...
curl -s http://localhost:3006/health > nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] message-sender-service
    set /a PASSED+=1
) else (
    echo [FAILED] message-sender-service
    set /a FAILED+=1
)

REM Test Analytics Service
echo Testing analytics-service...
curl -s http://localhost:3007/health > nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] analytics-service
    set /a PASSED+=1
) else (
    echo [FAILED] analytics-service
    set /a FAILED+=1
)

echo.
echo ==========================================
echo Test Summary:
echo ==========================================
echo Passed: %PASSED%
echo Failed: %FAILED%
echo Total:  7
echo.

echo ==========================================
echo Docker Container Status:
echo ==========================================
docker-compose ps

if %FAILED% EQU 0 (
    echo.
    echo [SUCCESS] All services are healthy!
    exit /b 0
) else (
    echo.
    echo [ERROR] Some services failed health checks
    exit /b 1
)
