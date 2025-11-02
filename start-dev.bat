@echo off
REM WhatsApp CRM - Development Environment Startup Script (Windows)

echo ========================================
echo Starting WhatsApp CRM Development Environment...
echo ========================================
echo.

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Docker is not running. Please start Docker Desktop first.
  pause
  exit /b 1
)

echo [OK] Docker is running
echo.

REM Navigate to docker directory
cd infrastructure\docker

REM Create .env if it doesn't exist
if not exist "..\..\env" (
  echo [INFO] Creating .env file from template...
  copy "..\..\env.example" "..\..\env"
  echo [WARN] Please edit .env with your credentials before continuing
  echo.
)

REM Start infrastructure services
echo [INFO] Starting infrastructure services...
docker-compose up -d postgres redis pubsub-emulator qdrant

REM Wait for services to be ready
echo [INFO] Waiting for services to be ready...
timeout /t 10 /nobreak >nul

REM Build and start microservices
echo [INFO] Building and starting Tenant Service...
docker-compose up -d --build tenant-service

echo.
echo ========================================
echo Development environment is ready!
echo ========================================
echo.
echo Services:
echo   - PostgreSQL:       localhost:5432
echo   - Redis:            localhost:6379
echo   - Pub/Sub Emulator: localhost:8085
echo   - Qdrant:           localhost:6333
echo   - Tenant Service:   http://localhost:3001
echo.
echo API Documentation:
echo   - Tenant Service:   http://localhost:3001/api/docs
echo.
echo View logs:
echo   docker-compose logs -f tenant-service
echo.
echo Stop all services:
echo   docker-compose down
echo.
pause
