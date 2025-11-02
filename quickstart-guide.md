# Quick Start Guide: Building Your First Service (Tenant Service)

This guide walks you through building the **Tenant Service** - the foundation of your WhatsApp CRM platform.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Project Initialization](#project-initialization)
4. [Database Setup](#database-setup)
5. [Core Implementation](#core-implementation)
6. [Testing](#testing)
7. [Running Locally](#running-locally)
8. [Next Steps](#next-steps)

---

## Prerequisites

Before starting, ensure you have:

- ✅ WSL2 installed and running Ubuntu
- ✅ Node.js 22+ installed via nvm (inside WSL)
- ✅ Docker and Docker Compose running
- ✅ Claude Code installed (`claude doctor` passes)
- ✅ GCP CLI authenticated (`gcloud auth application-default login`)
- ✅ PostgreSQL client tools (`sudo apt install postgresql-client`)

**Quick verification**:
```bash
# Run these commands in WSL terminal
node --version          # Should show v22.x.x
docker --version        # Should show Docker version
claude --version        # Should show Claude Code version
gcloud auth list        # Should show your authenticated account
```

---

## Environment Setup

### 1. Create Project Directory

```bash
# Navigate to your home directory (always work in WSL filesystem, NOT /mnt/c/)
cd ~

# Create project structure
mkdir -p projects/crm-product/services/tenant-service
cd projects/crm-product

# Initialize git repository
git init
```

### 2. Set Up Docker Compose

Create `docker-compose.yml` in the project root:

```yaml
version: '3.8'

networks:
  crm-network:
    driver: bridge

volumes:
  postgres-data:
  redis-data:

services:
  postgres:
    image: postgres:16-alpine
    container_name: crm-postgres
    environment:
      POSTGRES_DB: crm_dev
      POSTGRES_USER: crm_user
      POSTGRES_PASSWORD: crm_password
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - crm-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U crm_user -d crm_dev"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: crm-redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    networks:
      - crm-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  tenant-service:
    build:
      context: ./services/tenant-service
      dockerfile: Dockerfile.dev
    container_name: crm-tenant-service
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://crm_user:crm_password@postgres:5432/crm_dev
      - REDIS_URL=redis://redis:6379
      - PORT=3001
    volumes:
      - ./services/tenant-service/src:/app/src
      - /app/node_modules
    networks:
      - crm-network
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    command: npm run dev
```

### 3. Start Infrastructure

```bash
# Start PostgreSQL and Redis only (we'll build the service next)
docker-compose up -d postgres redis

# Verify services are running
docker-compose ps

# Check PostgreSQL is accessible
docker-compose exec postgres psql -U crm_user -d crm_dev -c "SELECT version();"
```

---

## Project Initialization

### 1. Initialize NestJS Project

```bash
cd services/tenant-service

# Initialize package.json
npm init -y

# Install NestJS core dependencies
npm install @nestjs/common@10.3.0 @nestjs/core@10.3.0 @nestjs/platform-express@10.3.0 \
  reflect-metadata@0.1.13 rxjs@7.8.1

# Install database & validation libraries
npm install @prisma/client@5.9.0 prisma@5.9.0 \
  class-validator@0.14.1 class-transformer@0.5.1

# Install Firebase Admin SDK
npm install firebase-admin@12.0.0

# Install Redis client
npm install ioredis@5.3.2

# Install utility libraries
npm install dotenv@16.4.5 helmet@7.1.0 \
  express-rate-limit@7.1.5 rate-limit-redis@4.2.0

# Install dev dependencies
npm install --save-dev @nestjs/cli@10.3.0 @nestjs/schematics@10.1.0 \
  @nestjs/testing@10.3.0 @types/node@20.11.0 \
  typescript@5.3.3 ts-node@10.9.2 \
  jest@29.7.0 @types/jest@29.5.11 ts-jest@29.1.2 \
  supertest@6.3.4 @types/supertest@6.0.2
```

### 2. Initialize TypeScript

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": false,
    "forceConsistentCasingInFileNames": false,
    "noFallthroughCasesInSwitch": false
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

### 3. Initialize Prisma (ORM)

```bash
# Initialize Prisma
npx prisma init

# This creates:
# - prisma/schema.prisma
# - .env
```

Edit `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Tenant {
  id              String    @id @default(uuid())
  name            String
  slug            String    @unique
  contactEmail    String?   @map("contact_email")
  status          String    @default("active")
  llmTone         Json      @default("{\"tone\": \"professional\"}") @map("llm_tone")
  firebaseTenantId String?  @map("firebase_tenant_id")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  
  outlets         Outlet[]
  users           User[]
  
  @@map("tenants")
}

model Outlet {
  id                      String   @id @default(uuid())
  tenantId                String   @map("tenant_id")
  name                    String
  wabaPhoneNumber         String   @unique @map("waba_phone_number")
  wabaPhoneNumberId       String   @map("waba_phone_number_id")
  wabaBusinessAccountId   String   @map("waba_business_account_id")
  wabaAccessToken         String   @map("waba_access_token")
  greetingMessage         String?  @map("greeting_message")
  status                  String   @default("active")
  createdAt               DateTime @default(now()) @map("created_at")
  updatedAt               DateTime @updatedAt @map("updated_at")
  
  tenant                  Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@index([tenantId])
  @@map("outlets")
}

model User {
  id           String   @id @default(uuid())
  tenantId     String   @map("tenant_id")
  firebaseUid  String   @unique @map("firebase_uid")
  email        String
  role         String   @default("agent")
  createdAt    DateTime @default(now()) @map("created_at")
  
  tenant       Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@unique([tenantId, email])
  @@index([tenantId])
  @@index([firebaseUid])
  @@map("users")
}
```

### 4. Create Project Structure

```bash
mkdir -p src/{auth,tenants,outlets,users,common,config}

# Create main files
touch src/main.ts
touch src/app.module.ts

# Create environment file
touch .env
```

Edit `.env`:

```bash
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://crm_user:crm_password@postgres:5432/crm_dev
REDIS_URL=redis://redis:6379

# Firebase (get these from Firebase Console)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

---

## Database Setup

### 1. Generate and Run Migration

```bash
# Generate Prisma Client
npx prisma generate

# Create migration
npx prisma migrate dev --name init

# Verify tables were created
docker-compose exec postgres psql -U crm_user -d crm_dev -c "\dt"
```

### 2. Seed Database (Optional)

Create `prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create test tenant
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Test Restaurant',
      slug: 'test-restaurant',
      contactEmail: 'admin@testrestaurant.com',
      status: 'active',
      llmTone: {
        tone: 'friendly',
        customInstructions: 'Always be polite and helpful',
      },
    },
  });

  console.log('Created tenant:', tenant);

  // Create test outlet
  const outlet = await prisma.outlet.create({
    data: {
      tenantId: tenant.id,
      name: 'Main Branch',
      wabaPhoneNumber: '+6281234567890',
      wabaPhoneNumberId: '123456789',
      wabaBusinessAccountId: '987654321',
      wabaAccessToken: 'test_token',
      greetingMessage: 'Welcome to Test Restaurant! How can I help you today?',
      status: 'active',
    },
  });

  console.log('Created outlet:', outlet);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

Run seed:

```bash
npx ts-node prisma/seed.ts
```

---

## Core Implementation

Now let's use **Claude Code** to build the service!

### 1. Start Claude Code

```bash
cd ~/projects/crm-product/services/tenant-service
claude
```

### 2. Prompts for Claude Code

Use these prompts sequentially to build the service:

#### Prompt 1: Basic Setup

```
I'm building a multi-tenant SaaS Tenant Service with NestJS. 

Project structure:
- src/main.ts - Application entry point
- src/app.module.ts - Root module
- src/config/ - Configuration modules
- src/auth/ - Authentication middleware
- src/tenants/ - Tenant CRUD operations
- src/outlets/ - Outlet management
- src/users/ - User management
- src/common/ - Shared utilities

Requirements:
1. Use Prisma ORM (schema already defined)
2. Firebase Auth for JWT validation
3. Redis for caching
4. Multi-tenant isolation (tenant_id in all queries)
5. Rate limiting per tenant
6. Health check endpoint

Please create:
1. src/main.ts - Bootstrap application with Helmet, CORS, validation pipes
2. src/app.module.ts - Import all feature modules
3. src/config/database.module.ts - Prisma client setup
4. src/config/firebase.module.ts - Firebase Admin SDK setup
5. src/config/redis.module.ts - Redis client setup

Use environment variables from .env file.
```

#### Prompt 2: Authentication

```
Create authentication middleware for the Tenant Service:

1. src/auth/auth.guard.ts
   - Validate Firebase JWT tokens
   - Extract user info (uid, email, tenantId, role)
   - Attach to request object
   - Return 401 for invalid tokens

2. src/auth/tenant-isolation.guard.ts
   - Ensure tenantId from JWT matches route parameter
   - Prevent cross-tenant data access
   - Return 403 for violations

3. src/auth/decorators/current-user.decorator.ts
   - Custom decorator to get current user from request
   - Usage: @CurrentUser() user: UserContext

4. src/auth/decorators/roles.decorator.ts
   - Custom decorator for role-based access control
   - Usage: @Roles('admin', 'agent')

5. src/auth/auth.module.ts
   - Export all guards and decorators

Include comprehensive error handling and logging.
```

#### Prompt 3: Tenant CRUD

```
Create the Tenant module with full CRUD operations:

1. src/tenants/dto/create-tenant.dto.ts
   - name: string (required, min 3 chars)
   - slug: string (required, lowercase, alphanumeric + hyphens)
   - contactEmail: string (optional, valid email)
   - llmTone: object (optional, default: {tone: "professional"})
   - Use class-validator decorators

2. src/tenants/dto/update-tenant.dto.ts
   - All fields optional
   - Extends PartialType(CreateTenantDto)

3. src/tenants/tenants.service.ts
   - create(data: CreateTenantDto): Promise<Tenant>
   - findAll(): Promise<Tenant[]>
   - findOne(id: string): Promise<Tenant>
   - update(id: string, data: UpdateTenantDto): Promise<Tenant>
   - delete(id: string): Promise<void>
   - Use Prisma Client for database operations
   - Cache results in Redis (5 min TTL)
   - Invalidate cache on updates

4. src/tenants/tenants.controller.ts
   - GET /api/v1/tenants (admin only)
   - POST /api/v1/tenants (public - signup)
   - GET /api/v1/tenants/:tenantId (authenticated, tenant isolation)
   - PUT /api/v1/tenants/:tenantId (admin of tenant)
   - DELETE /api/v1/tenants/:tenantId (admin only, soft delete)
   - Apply AuthGuard, TenantIsolationGuard, RolesGuard
   - Add Swagger decorators (@ApiTags, @ApiOperation)

5. src/tenants/tenants.module.ts
   - Import DatabaseModule, RedisModule
   - Provide TenantsService
   - Export TenantsController

Include error handling for:
- Duplicate slugs (409 Conflict)
- Tenant not found (404)
- Unauthorized access (403)
```

#### Prompt 4: Outlet Management

```
Create the Outlet module with greeting message customization:

1. src/outlets/dto/create-outlet.dto.ts
   - name: string (required)
   - wabaPhoneNumber: string (required, E.164 format)
   - wabaPhoneNumberId: string (required)
   - wabaBusinessAccountId: string (required)
   - wabaAccessToken: string (required, will be encrypted)
   - greetingMessage: string (optional, max 500 chars)
   - status: enum ['active', 'inactive'] (optional, default 'active')

2. src/outlets/dto/update-outlet.dto.ts
   - All fields optional except wabaAccessToken (security)
   - Custom method to update greeting: updateGreeting(message: string)

3. src/outlets/outlets.service.ts
   - create(tenantId: string, data: CreateOutletDto): Promise<Outlet>
   - findAll(tenantId: string): Promise<Outlet[]>
   - findOne(tenantId: string, outletId: string): Promise<Outlet>
   - update(tenantId: string, outletId: string, data: UpdateOutletDto): Promise<Outlet>
   - updateGreeting(tenantId: string, outletId: string, message: string): Promise<Outlet>
   - delete(tenantId: string, outletId: string): Promise<void>
   - Encrypt wabaAccessToken before storing (use crypto.createCipher)
   - Enforce tenant isolation (CRITICAL)

4. src/outlets/outlets.controller.ts
   - GET /api/v1/tenants/:tenantId/outlets
   - POST /api/v1/tenants/:tenantId/outlets
   - GET /api/v1/tenants/:tenantId/outlets/:outletId
   - PUT /api/v1/tenants/:tenantId/outlets/:outletId
   - PUT /api/v1/tenants/:tenantId/outlets/:outletId/greeting (special endpoint)
   - DELETE /api/v1/tenants/:tenantId/outlets/:outletId
   - Apply guards: AuthGuard, TenantIsolationGuard

5. src/outlets/outlets.module.ts
   - Import DatabaseModule
   - Provide OutletsService
   - Export OutletsController

Add validation:
- Phone number format (E.164)
- Unique WABA phone numbers
- Greeting message length (500 chars max)
- HTML/script injection prevention in greeting
```

#### Prompt 5: Health Check & Dockerization

```
Create health check and Docker setup:

1. src/common/health.controller.ts
   - GET /health
   - Check database connection (Prisma)
   - Check Redis connection
   - Return 200 if healthy, 503 if not
   - Response format: { status: 'ok', database: 'connected', redis: 'connected', timestamp: ISO }

2. Dockerfile.dev (for local development)
   - Base: node:22-alpine
   - Install dependencies
   - Use nodemon for hot reload
   - Expose port 3001
   - Health check: curl /health

3. Dockerfile (for production)
   - Multi-stage build
   - Builder stage: install deps, build
   - Production stage: copy artifacts, run as non-root
   - Smaller image size (<150MB)

4. Update package.json scripts:
   - "dev": "nest start --watch"
   - "build": "nest build"
   - "start": "node dist/main"
   - "migrate": "prisma migrate deploy"
   - "seed": "ts-node prisma/seed.ts"

5. .dockerignore
   - node_modules
   - dist
   - .env
   - .git
```

---

## Testing

### Create Tests with Claude Code

#### Prompt for Tests:

```
Create comprehensive tests for the Tenant Service:

1. src/tenants/tenants.service.spec.ts
   - Unit tests for all methods
   - Mock Prisma client
   - Mock Redis client
   - Test cases:
     * Create tenant successfully
     * Create tenant with duplicate slug (should throw)
     * Find tenant by ID (found and not found)
     * Update tenant (success and not found)
     * Delete tenant (success and not found)
     * Cache hit and miss scenarios

2. src/tenants/tenants.controller.spec.ts
   - Integration tests for all endpoints
   - Mock TenantsService
   - Test authentication (valid and invalid tokens)
   - Test authorization (admin vs regular user)
   - Test validation (invalid DTOs)

3. test/app.e2e-spec.ts
   - End-to-end tests
   - Use real database (test container)
   - Test full flow:
     * POST /api/v1/tenants (create)
     * GET /api/v1/tenants/:id (retrieve)
     * PUT /api/v1/tenants/:id (update)
     * GET /api/v1/tenants/:id (verify update)
     * DELETE /api/v1/tenants/:id (delete)
     * GET /api/v1/tenants/:id (verify 404)

Use Jest, Supertest, and @nestjs/testing utilities.
```

### Run Tests

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e

# Coverage
npm run test:cov
```

---

## Running Locally

### 1. Start All Services

```bash
# From project root
cd ~/projects/crm-product

# Start infrastructure + tenant service
docker-compose up -d

# View logs
docker-compose logs -f tenant-service

# Check health
curl http://localhost:3001/health
```

### 2. Test APIs with curl

```bash
# Create a tenant
curl -X POST http://localhost:3001/api/v1/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Restaurant",
    "slug": "my-restaurant",
    "contactEmail": "admin@myrestaurant.com",
    "llmTone": {
      "tone": "friendly",
      "customInstructions": "Always mention our daily specials"
    }
  }'

# Get tenant (requires Firebase JWT)
curl http://localhost:3001/api/v1/tenants/{tenant-id} \
  -H "Authorization: Bearer {firebase-jwt-token}"

# Create outlet with greeting
curl -X POST http://localhost:3001/api/v1/tenants/{tenant-id}/outlets \
  -H "Authorization: Bearer {firebase-jwt-token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Downtown Branch",
    "wabaPhoneNumber": "+6281234567890",
    "wabaPhoneNumberId": "123456789",
    "wabaBusinessAccountId": "987654321",
    "wabaAccessToken": "your-token",
    "greetingMessage": "Welcome to My Restaurant Downtown! 🍕 How can I assist you today?"
  }'

# Update greeting message
curl -X PUT http://localhost:3001/api/v1/tenants/{tenant-id}/outlets/{outlet-id}/greeting \
  -H "Authorization: Bearer {firebase-jwt-token}" \
  -H "Content-Type: application/json" \
  -d '{
    "greetingMessage": "Hi there! Welcome to My Restaurant. Looking for something delicious? 😊"
  }'
```

### 3. View Database

```bash
# Access Prisma Studio
npx prisma studio

# Or use psql
docker-compose exec postgres psql -U crm_user -d crm_dev

# Query tenants
SELECT id, name, slug, status FROM tenants;

# Query outlets with greetings
SELECT id, tenant_id, name, greeting_message FROM outlets;
```

---

## Next Steps

### 1. Add Swagger Documentation

#### Prompt for Claude:

```
Add Swagger/OpenAPI documentation to the Tenant Service:

1. Install dependencies:
   npm install @nestjs/swagger

2. Update src/main.ts:
   - Import SwaggerModule, DocumentBuilder
   - Configure Swagger with title, description, version
   - Add bearer auth for JWT
   - Mount at /api/docs

3. Add decorators to controllers:
   - @ApiTags('tenants') on controller
   - @ApiOperation({ summary: '...' }) on methods
   - @ApiBearerAuth() on protected routes
   - @ApiResponse for success and error cases

4. Add decorators to DTOs:
   - @ApiProperty() with examples and descriptions
```

### 2. Implement LLM Context Confirmation

This feature ensures the LLM asks clarifying questions when context is insufficient.

Create a new document: `docs/features/llm-context-confirmation.md`

```markdown
# LLM Context Confirmation Feature

## Overview
When the RAG system retrieves context with low confidence scores, the LLM should ask clarifying questions rather than giving uncertain answers.

## Implementation Strategy

### 1. Confidence Scoring (Knowledge Service)
```python
# In knowledge-service
def retrieve_context(query: str, tenant_id: str, threshold: float = 0.7):
    results = qdrant.search(
        collection_name="knowledge",
        query_vector=query_embedding,
        query_filter={"tenant_id": tenant_id},
        limit=5,
        score_threshold=threshold
    )
    
    confidence = results[0].score if results else 0
    
    return {
        "context": results,
        "confidence": confidence,
        "has_sufficient_context": confidence >= threshold
    }
```

### 2. Prompt Engineering (LLM Orchestration Service)
```python
# In llm-orchestration-service
async def generate_response(query: str, context: dict):
    if not context["has_sufficient_context"]:
        # Low confidence - ask clarifying questions
        prompt = f"""
        You don't have enough information to answer this confidently.
        
        Customer query: {query}
        Available context (low confidence): {context["context"]}
        
        Instead of guessing:
        1. Acknowledge you need more information
        2. Ask 1-2 specific clarifying questions
        3. Suggest what information would help
        
        Example: "I want to help you with that! To give you the best answer, 
        could you tell me [specific question]? This will help me provide accurate information."
        """
    else:
        # High confidence - answer normally
        prompt = f"""
        Context: {context["context"]}
        Question: {query}
        Answer:
        """
    
    return await call_llm(prompt)
```

### 3. Conversation Flow
1. Customer asks question
2. RAG retrieves context with confidence score
3. If confidence < 0.7:
   - LLM asks clarifying question
   - Store "awaiting_clarification" state
   - Next message from customer treated as clarification
   - Re-run RAG with enhanced query
4. If confidence >= 0.7:
   - LLM answers normally

### 4. Testing Scenarios
- Question: "What are your hours?"
  - No context → "I'd be happy to help! Which location are you asking about?"
- Question: "Do you have vegan options?"
  - Low context → "We do have options! Are you looking for appetizers, main courses, or desserts?"
- Question: "What's in the Margherita pizza?"
  - High context → "Our Margherita pizza contains..." (full answer)
```

### 3. Set Up Monitoring

#### Prompt for Claude:

```
Add Prometheus metrics to the Tenant Service:

1. Install dependencies:
   npm install prom-client

2. Create src/common/metrics.service.ts:
   - Initialize Prometheus registry
   - Create metrics:
     * http_requests_total (Counter)
     * http_request_duration_seconds (Histogram)
     * active_connections (Gauge)
     * tenant_operations_total (Counter by operation)
   - Export metrics at /metrics endpoint

3. Create metrics middleware:
   - Record request count
   - Record request duration
   - Record errors by status code

4. Add business metrics:
   - tenant_created_total
   - tenant_deleted_total
   - outlet_created_total
   - greeting_updated_total
```

### 4. Build Other Services

Now that you have the Tenant Service working, follow the same pattern for:

1. **Billing Service** (Go + Gin)
   - Use this structure as reference
   - Implement subscription tiers from claude.md
   - Add quota enforcement logic

2. **Knowledge Service** (Python + FastAPI)
   - Document upload and parsing
   - RAG with confidence scoring
   - Context confirmation feature

3. **Conversation Service** (Node.js + Express)
   - WebSocket for real-time
   - Message history management
   - Handoff detection

Continue with other services as documented in `claude.md`.

---

## Troubleshooting

### Common Issues

**Issue**: Prisma can't connect to database
```bash
# Solution: Check DATABASE_URL in .env
echo $DATABASE_URL

# Ensure postgres is running
docker-compose ps postgres

# Test connection
docker-compose exec postgres psql -U crm_user -d crm_dev -c "SELECT 1;"
```

**Issue**: Port 3001 already in use
```bash
# Solution: Find and kill process
lsof -i :3001
kill -9 <PID>

# Or change port in docker-compose.yml
```

**Issue**: Module not found errors
```bash
# Solution: Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

**Issue**: Claude Code permission errors
```bash
# Solution: Never use sudo with npm/Claude Code
# If you did, fix permissions:
sudo chown -R $USER:$USER ~/.npm-global
sudo chown -R $USER:$USER ~/.cache
```

---

## Summary Checklist

Before moving to the next service, ensure:

- [ ] Tenant Service running locally
- [ ] Database migrations applied
- [ ] All CRUD endpoints working
- [ ] Authentication working (Firebase JWT)
- [ ] Tenant isolation enforced
- [ ] Greeting messages customizable per outlet
- [ ] Health check returns 200
- [ ] Tests passing (unit + integration)
- [ ] Swagger docs accessible at /api/docs
- [ ] Docker build succeeds
- [ ] Metrics exposed at /metrics

**Estimated Time**: 2-3 days for full implementation and testing

---

## Additional Resources

- **NestJS Documentation**: https://docs.nestjs.com
- **Prisma Documentation**: https://www.prisma.io/docs
- **Firebase Admin SDK**: https://firebase.google.com/docs/admin/setup
- **Claude Code Documentation**: https://docs.claude.com/en/docs/claude-code

---

**Next Service**: Proceed to Knowledge Service (Python + FastAPI) with RAG and context confirmation.

See `docs/03-service-specifications.md` for detailed specs of all services.