# Tenant Service

Tenant and outlet management service for WhatsApp CRM platform.

## Features

- **Tenant Management**: CRUD operations for tenants
- **Outlet Management**: Multi-outlet support per tenant
- **User Management**: Role-based user management
- **Multi-tenant Isolation**: Row-level security with tenant filtering
- **Firebase Integration**: JWT-based authentication (ready to enable)

## Tech Stack

- **Framework**: NestJS
- **Language**: TypeScript
- **Database**: PostgreSQL with TypeORM
- **Cache**: Redis
- **Messaging**: Google Pub/Sub
- **Documentation**: Swagger/OpenAPI

## API Endpoints

### Tenants
- `POST /api/v1/tenants` - Create tenant
- `GET /api/v1/tenants` - List all tenants
- `GET /api/v1/tenants/:id` - Get tenant by ID
- `GET /api/v1/tenants/slug/:slug` - Get tenant by slug
- `PUT /api/v1/tenants/:id` - Update tenant
- `PUT /api/v1/tenants/:id/llm-config` - Update LLM configuration
- `DELETE /api/v1/tenants/:id` - Delete tenant

### Outlets
- `POST /api/v1/outlets` - Create outlet
- `GET /api/v1/outlets` - List all outlets
- `GET /api/v1/outlets/tenant/:tenantId` - List tenant outlets
- `GET /api/v1/outlets/:id` - Get outlet by ID
- `PUT /api/v1/outlets/:id` - Update outlet
- `DELETE /api/v1/outlets/:id` - Delete outlet

### Users
- `POST /api/v1/users` - Create user
- `GET /api/v1/users` - List all users
- `GET /api/v1/users/tenant/:tenantId` - List tenant users
- `GET /api/v1/users/:id` - Get user by ID
- `PUT /api/v1/users/:id/role` - Update user role
- `DELETE /api/v1/users/:id` - Delete user

### Health
- `GET /health` - Service health check

## Development

### Prerequisites
- Node.js 22+
- PostgreSQL 16
- Redis

### Installation
```bash
npm install
```

### Environment Variables
Create a `.env` file:
```bash
DATABASE_URL=postgresql://crm_user:crm_password@localhost:5432/crm_dev
REDIS_URL=redis://localhost:6379
PORT=3001
NODE_ENV=development
```

### Run Locally
```bash
# Development mode with hot reload
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

### Testing
```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

### Docker
```bash
# Build image
docker build -t tenant-service:latest .

# Run container
docker run -p 3001:3001 \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_URL=redis://... \
  tenant-service:latest
```

## API Documentation

Swagger documentation is available at:
```
http://localhost:3001/api/docs
```

## Architecture

- **Controllers**: Handle HTTP requests
- **Services**: Business logic layer
- **Entities**: TypeORM database models
- **DTOs**: Request/response validation

## Security

- Firebase Auth middleware (ready to enable)
- Row-Level Security (RLS) in PostgreSQL
- Input validation with class-validator
- Helmet.js for security headers (TODO)

## License

Proprietary
