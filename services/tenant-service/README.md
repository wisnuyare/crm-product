# Tenant Service

**Status**: ✅ 100% COMPLETE - PRODUCTION READY
**Language**: TypeScript (Node.js 22)
**Framework**: NestJS
**Port**: 3001
**Database**: PostgreSQL

---

## Overview

The Tenant Service is the central authority for managing tenants, outlets, users, and core configurations in the WhatsApp CRM platform. It acts as the master service for identifying clients and providing other services with the necessary context, such as LLM tone, custom messages, and WhatsApp Business Account (WABA) credentials.

### Key Features

- **Tenant Management**: Full CRUD operations for tenants, including custom branding and messaging.
- **Outlet Management**: Supports multiple WhatsApp-enabled outlets per tenant.
- **User Management**: Manages users and their roles (admin, agent, viewer) within a tenant.
- **LLM Configuration**: Stores per-tenant LLM tone and personality settings.
- **Multi-tenant Isolation**: Enforces strict data separation using PostgreSQL Row-Level Security (RLS).
- **Authentication Ready**: Pre-configured for Firebase JWT-based authentication.

---

## API Endpoints

Swagger/OpenAPI documentation is also available at `http://localhost:3001/api/docs`.

### Health Check

- **Endpoint**: `GET /health`
- **Description**: Checks the health and database connectivity of the service.
- **Response**: `200 OK`

---

### Tenant Endpoints

#### List Tenants
- **Endpoint**: `GET /api/v1/tenants`
- **Description**: Retrieves a list of all tenants.
- **Response**: `200 OK` (Array of tenant objects)

#### Create Tenant
- **Endpoint**: `POST /api/v1/tenants`
- **Description**: Creates a new tenant.
- **Request Body** (`create-tenant.dto.ts`):
  ```json
  {
    "name": "New Awesome Company",
    "slug": "new-awesome-company",
    "contact_email": "admin@newco.com"
  }
  ```
- **Response**: `201 Created` (The newly created tenant object)

#### Get Tenant by ID
- **Endpoint**: `GET /api/v1/tenants/:id`
- **Description**: Retrieves a single tenant by its UUID.
- **Response**: `200 OK` (The tenant object)

#### Update Tenant
- **Endpoint**: `PUT /api/v1/tenants/:id`
- **Description**: Updates the core details of a tenant.
- **Request Body** (`update-tenant.dto.ts`):
  ```json
  {
    "name": "Updated Company Name",
    "status": "active",
    "contact_email": "support@updatedco.com"
  }
  ```
- **Response**: `200 OK` (The updated tenant object)

#### Update LLM Configuration
- **Endpoint**: `PUT /api/v1/tenants/:id/llm-config`
- **Description**: Updates the LLM tone and personality for a tenant.
- **Request Body** (`update-llm-config.dto.ts`):
  ```json
  {
    "tone": "friendly",
    "custom_instructions": "Always use emojis in your responses.",
    "greeting_message": "Hey there! How can I brighten your day? ✨",
    "error_message": "Oops! I seem to have hit a snag. Can you try asking another way?"
  }
  ```
- **Response**: `200 OK` (The updated tenant object)

---

### Outlet Endpoints

#### List Tenant Outlets
- **Endpoint**: `GET /api/v1/outlets/tenant/:tenantId`
- **Description**: Retrieves all outlets associated with a specific tenant.
- **Response**: `200 OK` (Array of outlet objects)

#### Create Outlet
- **Endpoint**: `POST /api/v1/outlets`
- **Description**: Creates a new outlet for a tenant.
- **Request Body** (`create-outlet.dto.ts`):
  ```json
  {
    "tenant_id": "tenant-uuid",
    "name": "Main Branch",
    "waba_phone_number": "+15551234567",
    "waba_phone_number_id": "10987654321",
    "waba_business_account_id": "20987654321",
    "waba_access_token": "EAAG..."
  }
  ```
- **Response**: `201 Created` (The newly created outlet object)

---

### User Endpoints

#### List Tenant Users
- **Endpoint**: `GET /api/v1/users/tenant/:tenantId`
- **Description**: Retrieves all users associated with a specific tenant.
- **Response**: `200 OK` (Array of user objects)

#### Create User
- **Endpoint**: `POST /api/v1/users`
- **Description**: Creates a new user for a tenant.
- **Request Body** (`create-user.dto.ts`):
  ```json
  {
    "tenant_id": "tenant-uuid",
    "firebase_uid": "firebase-user-uuid",
    "email": "agent@newco.com",
    "role": "agent"
  }
  ```
- **Response**: `201 Created` (The newly created user object)

---

## Database Schema

The core schema is defined in `infrastructure/docker/init-db.sql`.

### `tenants` Table
```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  llm_tone JSONB DEFAULT '{"tone": "professional"}',
  greeting_message TEXT,
  error_message TEXT,
  contact_email VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### `outlets` Table
```sql
CREATE TABLE outlets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  waba_phone_number VARCHAR(50) UNIQUE NOT NULL,
  waba_phone_number_id VARCHAR(255) NOT NULL,
  waba_business_account_id VARCHAR(255) NOT NULL,
  waba_access_token TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);
```

### `users` Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  firebase_uid VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'agent' CHECK (role IN ('admin', 'agent', 'viewer')),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);
```

---

## Multi-Tenant Isolation

This service employs a robust multi-tenancy strategy using PostgreSQL's Row-Level Security (RLS).

1.  **RLS Enabled**: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` is active on all tenant-scoped tables.
2.  **Policy Enforcement**: A policy like `USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)` ensures that queries can only see data matching the tenant ID set for the current session.
3.  **Forced Security**: `ALTER TABLE ... FORCE ROW LEVEL SECURITY` ensures that even table owners are subject to RLS policies, preventing accidental data leaks.

This database-level enforcement provides a strong security guarantee against cross-tenant data access.

---

## Development & Testing

### Prerequisites
- Node.js 22+
- PostgreSQL 16
- Docker

### Running Locally
1.  **Start Database**:
    ```bash
    cd infrastructure/docker
    docker-compose up -d postgres
    ```
2.  **Set Environment**: Create a `.env` file in the `services/tenant-service` directory:
    ```
    DATABASE_URL=postgresql://crm_user:crm_password@localhost:5432/crm_dev
    PORT=3001
    NODE_ENV=development
    ```
3.  **Install & Run**:
    ```bash
    cd services/tenant-service
    npm install
    npm run start:dev
    ```

### Testing
```bash
# Run all unit tests
npm test

# Run end-to-end tests
npm run test:e2e
```