# Order Service

**Status**: ✅ 100% COMPLETE - PRODUCTION READY
**Language**: Go 1.21
**Framework**: Gin
**Port**: 3009
**Database**: PostgreSQL

---

## Overview

The Order Service provides comprehensive order and product management capabilities for the WhatsApp CRM platform. It enables conversational commerce by managing the product catalog, processing orders, tracking inventory, and exposing functions for the LLM to use.

### Key Features

- **Product Catalog**: Full CRUD for products, including categories, SKU, and stock tracking.
- **Order Management**: Create, update, and manage customer orders with a defined status workflow.
- **Inventory Control**: Automatic stock deduction on order creation and restoration on cancellation.
- **LLM Function Calling**: Exposes `check_product_availability` and `create_order` functions for conversational ordering.
- **Multi-tenant Isolation**: All data is partitioned and queried by `tenant_id`.
- **Payment Tracking**: Monitors order payment status (unpaid, partially paid, paid).

---

## API Endpoints

All endpoints require an `X-Tenant-Id` header for multi-tenant data isolation.

### Health Check

- **Endpoint**: `GET /health`
- **Description**: Checks the health and connectivity of the service.
- **Response**: `200 OK`
  ```json
  {
    "status": "healthy",
    "service": "order-service"
  }
  ```

---


### Product Endpoints

#### List Products
- **Endpoint**: `GET /api/v1/products`
- **Description**: Retrieves a list of products, with optional filtering.
- **Query Parameters**: `search`, `status`, `category`
- **Response**: `200 OK` (Array of product objects)

#### Create Product
- **Endpoint**: `POST /api/v1/products`
- **Description**: Adds a new product to the catalog.
- **Request Body**:
  ```json
  {
    "name": "Strawberry Cake",
    "description": "Fresh strawberry cake with whipped cream",
    "price": 170000,
    "stock_quantity": 12,
    "low_stock_threshold": 3,
    "category": "Cakes",
    "sku": "CAKE-STRAW-20"
  }
  ```
- **Response**: `201 Created` (The newly created product object)

#### Get Product
- **Endpoint**: `GET /api/v1/products/:id`
- **Description**: Retrieves a single product by its ID.
- **Response**: `200 OK` (The product object)

#### Update Product
- **Endpoint**: `PUT /api/v1/products/:id`
- **Description**: Updates the details of an existing product.
- **Response**: `200 OK` (The updated product object)

#### Adjust Stock
- **Endpoint**: `PUT /api/v1/products/:id/stock`
- **Description**: Manually adjusts the stock for a product and logs the reason.
- **Request Body**:
  ```json
  {
    "adjustment": -3,
    "reason": "Damaged during transport"
  }
  ```
- **Response**: `200 OK`

#### Get Low Stock Products
- **Endpoint**: `GET /api/v1/products/low-stock`
- **Description**: Retrieves all products where `stock_quantity` is at or below `low_stock_threshold`.
- **Response**: `200 OK` (Array of product objects)

---


### Order Endpoints

#### List Orders
- **Endpoint**: `GET /api/v1/orders`
- **Description**: Retrieves a list of orders, with optional filtering.
- **Query Parameters**: `status`, `customer_phone`, `date_from`, `date_to`
- **Response**: `200 OK` (Array of order objects)

#### Create Order
- **Endpoint**: `POST /api/v1/orders`
- **Description**: Creates a new customer order and deducts stock.
- **Request Body**:
  ```json
  {
    "customer_phone": "+6281234567890",
    "customer_name": "Ibu Siti",
    "items": [
      {
        "product_id": "product-uuid-1",
        "quantity": 2,
        "notes": "Extra chocolate frosting"
      }
    ],
    "pickup_delivery_date": "2025-11-10",
    "fulfillment_type": "pickup",
    "notes": "Pickup at 2 PM"
  }
  ```
- **Response**: `201 Created` (The newly created order object)

#### Get Order
- **Endpoint**: `GET /api/v1/orders/:id`
- **Description**: Retrieves a single order by its ID.
- **Response**: `200 OK` (The order object with line items)

#### Update Order Status
- **Endpoint**: `PUT /api/v1/orders/:id/status`
- **Description**: Updates the status of an order (e.g., from `pending` to `confirmed`).
- **Request Body**:
  ```json
  {
    "status": "confirmed"
  }
  ```
- **Response**: `200 OK`

#### Cancel Order
- **Endpoint**: `DELETE /api/v1/orders/:id`
- **Description**: Cancels an order and restores the stock for all line items.
- **Response**: `204 No Content`

---


## LLM Function Integration

The service is designed for conversational commerce through two primary LLM functions.

### `check_product_availability`
- **Purpose**: Allows the LLM to search the product catalog based on a customer's message.
- **LLM Input**: `{"product_names": ["chocolate cake"]}`
- **Action**: The service queries the `products` table for items matching the names and checks their `stock_quantity`.
- **Output**: A list of available products and their stock status, which the LLM uses to inform the customer.

### `create_order`
- **Purpose**: Allows the LLM to create an order directly from a conversation.
- **LLM Input**:
  ```json
  {
    "customer_phone": "+6281234567890",
    "items": [{"product_id": "uuid-of-cake", "quantity": 2}],
    "pickup_date": "2025-11-09",
    "fulfillment_type": "pickup"
  }
  ```
- **Action**: The service validates the request, checks stock, creates the order, and deducts inventory.
- **Output**: A confirmation of the created order, which the LLM relays to the customer.

---


## Workflows

### Order Status Workflow
The service enforces a standard order lifecycle:
`pending` → `confirmed` → `preparing` → `ready` → `completed`

A `cancelled` status is also available from any state, which triggers a stock restoration.

### Inventory Management
- **Automatic Deduction**: Stock is reserved and deducted when an order is created. The operation is atomic. If stock is insufficient, the order fails.
- **Automatic Restoration**: Stock is returned to the catalog when an order status is changed to `cancelled`.
- **Audit Trail**: All manual and automatic stock changes are logged in the `stock_adjustments` table for auditing.

---


## Database Schema

The schema is defined in `infrastructure/docker/migrations/005_create_order_management_tables.sql`.

- **`products`**: Stores the product catalog, including name, price, SKU, and stock levels.
- **`orders`**: Contains header-level information for customer orders.
- **`order_items`**: Stores the line items for each order.
- **`stock_adjustments`**: An audit log of all changes to inventory levels.
- **`categories`**: A simple table for product categories.

---


## Development & Testing

### Running Locally

1.  **Start Database**:
    ```bash
    cd infrastructure/docker
    docker-compose up -d postgres
    ```
2.  **Apply Migrations**:
    ```bash
    docker-compose exec -T postgres psql -U crm_user -d crm_dev < migrations/005_create_order_management_tables.sql
    ```
3.  **Set Environment**: Create a `.env` file in the project root or export variables:
    ```bash
    export DATABASE_URL="postgresql://crm_user:crm_password@localhost:5432/crm_dev?sslmode=disable"
    export PORT="3009"
    ```
4.  **Run Service**:
    ```bash
    cd services/order-service
    go run cmd/main.go
    ```

### Testing with cURL

```bash
# Check health
curl http://localhost:3009/health

# Search for a product
curl "http://localhost:3009/api/v1/products?search=cake" \
  -H "X-Tenant-Id: 00000000-0000-0000-0000-000000000001"

# Create an order
curl -X POST http://localhost:3009/api/v1/orders \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: 00000000-0000-0000-0000-000000000001" \
  -d '{
        "customer_phone": "+6281234567890",
        "items": [{"product_id": "YOUR_PRODUCT_ID", "quantity": 1}]
      }'
```