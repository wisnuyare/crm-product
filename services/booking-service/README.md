# Booking Service (Proof of Concept)

**Status**: ⚠️ IN DEVELOPMENT (POC)
**Language**: Go 1.21
**Framework**: Gin
**Port**: 3008
**Database**: PostgreSQL

---

## Overview

The Booking Service is a Proof of Concept (POC) designed to manage bookable resources and their corresponding bookings. It provides a basic API for creating and viewing resources (like sports courts or rooms) and booking them for specific time slots.

This service is intended to validate the core booking concept before full-scale development.

### Key Features (POC)

- **Resource Management**: Create and list bookable resources (e.g., "Court A").
- **Booking Management**: Create and list bookings for resources.
- **Tenant Isolation**: All data is scoped by `X-Tenant-Id`.
- **Conflict Checking**: Basic check to prevent double-booking the exact same time slot.

---

## API Endpoints

All endpoints require an `X-Tenant-Id` header. A default is used for this POC if not provided.

### Health Check

- **Endpoint**: `GET /health`
- **Description**: Checks the health of the service.
- **Response**:
  ```json
  {
    "status": "healthy",
    "service": "booking-service",
    "version": "0.1.0-poc"
  }
  ```

---

### Resources

#### List Resources

- **Endpoint**: `GET /api/v1/resources`
- **Description**: Retrieves a list of all bookable resources for the tenant.
- **Response**: `200 OK`
  ```json
  {
    "resources": [
      {
        "id": "uuid-goes-here",
        "tenant_id": "tenant-uuid",
        "outlet_id": "outlet-uuid",
        "name": "Court A",
        "type": "futsal",
        "hourly_rate": 200000.00,
        "status": "active",
        "created_at": "2025-11-17T10:00:00Z",
        "updated_at": "2025-11-17T10:00:00Z"
      }
    ],
    "total": 1
  }
  ```

#### Create Resource

- **Endpoint**: `POST /api/v1/resources`
- **Description**: Creates a new bookable resource.
- **Request Body**:
  ```json
  {
    "name": "Court B",
    "type": "futsal",
    "hourly_rate": 200000.00
  }
  ```
- **Response**: `201 Created` (Returns the newly created resource object)

#### Get Resource

- **Endpoint**: `GET /api/v1/resources/:id`
- **Description**: Retrieves a single resource by its ID.
- **Response**: `200 OK` (Returns the resource object)

---

### Bookings

#### List Bookings

- **Endpoint**: `GET /api/v1/bookings`
- **Description**: Retrieves a list of bookings for the tenant. Supports filtering by query parameters.
- **Query Parameters**:
  - `resource_id` (string, optional): Filter by resource UUID.
  - `status` (string, optional): Filter by booking status (e.g., `pending`, `confirmed`).
  - `date` (string, optional): Filter by date in `YYYY-MM-DD` format.
- **Response**: `200 OK`
  ```json
  {
    "bookings": [
      {
        "id": "booking-uuid",
        "tenant_id": "tenant-uuid",
        "outlet_id": "outlet-uuid",
        "resource_id": "resource-uuid",
        "customer_phone": "+628123456789",
        "customer_name": "Andi Wijaya",
        "conversation_id": null,
        "booking_date": "2025-11-18",
        "start_time": "18:00:00",
        "end_time": "19:00:00",
        "status": "confirmed",
        "total_price": 200000.00,
        "notes": null,
        "created_at": "2025-11-17T11:00:00Z",
        "updated_at": "2025-11-17T11:00:00Z",
        "resource_name": "Court A",
        "resource_type": "futsal"
      }
    ],
    "total": 1
  }
  ```

#### Create Booking

- **Endpoint**: `POST /api/v1/bookings`
- **Description**: Creates a new booking for a resource.
- **Request Body**:
  ```json
  {
    "resource_id": "resource-uuid",
    "customer_phone": "+628987654321",
    "customer_name": "Budi Santoso",
    "booking_date": "2025-11-18",
    "start_time": "19:00",
    "end_time": "20:00",
    "total_price": 200000.00,
    "notes": "Team jersey is blue."
  }
  ```
- **Response**: `201 Created`
  ```json
  {
    "message": "Booking created successfully",
    "booking": {
      // ... booking object ...
    }
  }
  ```

#### Get Booking

- **Endpoint**: `GET /api/v1/bookings/:id`
- **Description**: Retrieves a single booking by its ID.
- **Response**: `200 OK` (Returns the booking object with resource details)

---

## Database Schema

The database schema is defined in `infrastructure/docker/migrations/004_create_booking_tables_poc.sql`.

### `resources` Table
```sql
CREATE TABLE IF NOT EXISTS resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100),
  hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'retired')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_resource_name_per_outlet UNIQUE(outlet_id, name)
);
```

### `bookings` Table
```sql
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  customer_phone VARCHAR(50) NOT NULL,
  customer_name VARCHAR(255),
  conversation_id UUID REFERENCES conversations(id),
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  total_price DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT check_time_order CHECK (end_time > start_time)
);
```

---

## Development & Testing

### Running Locally

1.  **Start Database**: Ensure PostgreSQL is running (e.g., via `docker-compose up -d postgres`).
2.  **Set Environment**: Create a `.env` file in the project root or export the required variables:
    ```bash
    export DATABASE_URL="postgresql://crm_user:crm_password@localhost:5432/crm_dev?sslmode=disable"
    export PORT="3008"
    ```
3.  **Run Service**:
    ```bash
    cd services/booking-service
    go run cmd/main.go
    ```
4.  **Test Health**:
    ```bash
    curl http://localhost:3008/health
    ```

### Testing with cURL

```bash
# List resources
curl -H "X-Tenant-Id: 00000000-0000-0000-0000-000000000001" http://localhost:3008/api/v1/resources

# Create a booking
curl -X POST http://localhost:3008/api/v1/bookings \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: 00000000-0000-0000-0000-000000000001" \
  -d '{
        "resource_id": "YOUR_RESOURCE_ID",
        "customer_phone": "+6281234567890",
        "customer_name": "Test Booker",
        "booking_date": "2025-12-01",
        "start_time": "10:00",
        "end_time": "11:00",
        "total_price": 150000
      }'
```
