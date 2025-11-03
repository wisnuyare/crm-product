# 🚀 Quick Start Guide - WhatsApp CRM

## Prerequisites

Before you begin, make sure you have:

- [ ] **Docker Desktop** installed and **running**
  - Download from: https://www.docker.com/products/docker-desktop
  - **Important**: Start Docker Desktop before running commands
- [ ] **Node.js 22+** installed
- [ ] **Firebase Project** created (for authentication)
- [ ] **OpenAI API Key** (for LLM features)

---

## Step 1: Start Infrastructure Services

Make sure Docker Desktop is running, then:

```bash
cd infrastructure/docker
docker-compose up -d
```

This will start:
- ✅ PostgreSQL database (port 5432)
- ✅ Redis cache (port 6379)
- ✅ Pub/Sub emulator (port 8085)
- ✅ Qdrant vector database (port 6333)
- ✅ Tenant Service (port 3001)

**Verify all services are running:**
```bash
docker-compose ps
```

You should see all services with status "Up".

---

## Step 2: Check Database Initialization

The database should auto-initialize with the schema from `init-db.sql`. Verify:

```bash
docker-compose exec postgres psql -U crm_user -d crm_dev -c "\dt"
```

You should see tables: `tenants`, `outlets`, `users`, `conversations`, etc.

---

## Step 3: Configure Firebase Credentials (Required for Auth)

### Option A: For Testing (Skip Authentication)
If you want to test WITHOUT Firebase Auth temporarily:

1. Comment out the FirebaseAuthGuard in `services/tenant-service/src/app.module.ts`:
```typescript
// {
//   provide: APP_GUARD,
//   useClass: FirebaseAuthGuard,
// },
```

2. Rebuild the container:
```bash
cd infrastructure/docker
docker-compose up -d --build tenant-service
```

### Option B: Set Up Firebase (Recommended for Production)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select existing
3. Go to **Project Settings** > **Service Accounts**
4. Click **Generate New Private Key**
5. Update `.env` file with:
```bash
FIREBASE_PROJECT_ID=your-actual-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nPASTE_YOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
```

6. Restart the service:
```bash
cd infrastructure/docker
docker-compose restart tenant-service
```

---

## Step 4: Test the Tenant Service

### Check Health Endpoint
```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-11-03T...",
  "database": "connected",
  "redis": "connected"
}
```

### View API Documentation
Open in browser: **http://localhost:3001/api/docs**

This shows the Swagger UI with all available endpoints.

### Test Creating a Tenant (Public Endpoint)

**Note**: If Firebase Auth is enabled, you'll need a valid JWT token. For testing, you can use the public endpoint:

```bash
curl -X GET http://localhost:3001/api/v1/tenants/slug/test-tenant-1
```

Expected response:
```json
{
  "id": "00000000-0000-0000-0000-000000000001",
  "name": "Test Tenant 1",
  "slug": "test-tenant-1",
  "status": "active",
  "outlets": [...],
  "users": [...]
}
```

---

## Step 5: Test with Authentication (If Firebase is configured)

### Get a Test Token

1. Install Firebase CLI (if not already):
```bash
npm install -g firebase-tools
firebase login
```

2. Get a custom token for testing:
```bash
# In your Firebase project directory
firebase auth:export users.json
```

Or use Firebase Admin SDK in a test script to create a user and generate a token.

### Make Authenticated Requests

```bash
# Replace YOUR_JWT_TOKEN with actual token
curl -X GET http://localhost:3001/api/v1/tenants \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Step 6: View Logs

### View all services logs:
```bash
cd infrastructure/docker
docker-compose logs -f
```

### View specific service logs:
```bash
docker-compose logs -f tenant-service
docker-compose logs -f postgres
docker-compose logs -f redis
```

---

## Step 7: Stop Services

```bash
cd infrastructure/docker
docker-compose down
```

To also remove volumes (⚠️ this deletes all data):
```bash
docker-compose down -v
```

---

## Common Issues & Solutions

### Issue: "Docker not running"
**Solution**: Start Docker Desktop application

### Issue: "Port already in use"
**Solution**: Change port in docker-compose.yml or stop conflicting service
```bash
# Find what's using port 3001
netstat -ano | findstr :3001
```

### Issue: "Firebase Admin not initialized"
**Solution**:
1. Check `.env` file has correct Firebase credentials
2. Make sure private key format is correct (includes `\n` for newlines)
3. Restart tenant-service: `docker-compose restart tenant-service`

### Issue: "Database connection failed"
**Solution**:
1. Make sure PostgreSQL container is running: `docker-compose ps`
2. Check logs: `docker-compose logs postgres`
3. Verify DATABASE_URL in docker-compose.yml matches PostgreSQL config

### Issue: "Cannot access localhost:3001"
**Solution**:
1. Check if container is running: `docker-compose ps tenant-service`
2. Check container logs: `docker-compose logs tenant-service`
3. Verify port mapping in docker-compose.yml

---

## Development Workflow

### Making Code Changes

1. Make changes to code in `services/tenant-service/src/`
2. Rebuild and restart:
```bash
cd infrastructure/docker
docker-compose up -d --build tenant-service
```

3. View logs to verify:
```bash
docker-compose logs -f tenant-service
```

### Running Tests

```bash
cd services/tenant-service
npm test
```

### Adding New Dependencies

```bash
cd services/tenant-service
npm install package-name
# Rebuild container
cd ../../infrastructure/docker
docker-compose up -d --build tenant-service
```

---

## Next Steps

Once the Tenant Service is working:

1. ✅ Complete unit tests
2. ✅ Build Billing Service (Go)
3. ✅ Build Knowledge Service (Python)
4. ✅ Build Conversation Service (Node.js)
5. ✅ Build LLM Orchestration Service (Python)
6. ✅ Build Message Sender Service (Go)
7. ✅ Set up CI/CD pipeline

See `SHIPPING_CHECKLIST.md` for the complete roadmap.

---

## Useful Commands Cheat Sheet

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# View logs
docker-compose logs -f [service-name]

# Rebuild a service
docker-compose up -d --build [service-name]

# Restart a service
docker-compose restart [service-name]

# Execute command in container
docker-compose exec [service-name] [command]

# Access database
docker-compose exec postgres psql -U crm_user -d crm_dev

# Access Redis CLI
docker-compose exec redis redis-cli

# Remove all data (⚠️ destructive)
docker-compose down -v
```

---

## Support

- **Documentation**: See `CLAUDE.md` for full architecture
- **Checklist**: See `SHIPPING_CHECKLIST.md` for development roadmap
- **Issues**: Check logs with `docker-compose logs`

Happy coding! 🚀
