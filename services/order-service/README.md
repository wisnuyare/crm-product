# Order Service

**Order Management microservice for WhatsApp CRM** - Handles product catalog, orders, and inventory management.

## Overview

The Order Service enables conversational commerce via WhatsApp, allowing customers to place orders through natural language chat. It manages the product catalog, processes orders, tracks inventory, and integrates with the LLM for automated order creation.

## Technology Stack

- **Language**: Go 1.21
- **Framework**: Gin (HTTP router)
- **Database**: PostgreSQL
- **Port**: 3009
- **Container**: Docker

## Features

### Product Management
- ✅ Create, read, update, delete products
- ✅ Stock quantity tracking
- ✅ Low stock alerts (threshold-based)
- ✅ Product categories
- ✅ SKU management
- ✅ Product search by name/description/SKU

### Order Management
- ✅ Create orders with multiple items
- ✅ Order status workflow (pending → confirmed → preparing → ready → completed)
- ✅ Automatic stock deduction on order creation
- ✅ Stock restoration on order cancellation
- ✅ Payment status tracking (unpaid/partially paid/paid)
- ✅ Order search and filtering
- ✅ Customer order history

### Inventory Management
- ✅ Automatic stock adjustments
- ✅ Manual stock adjustments with reason logging
- ✅ Stock adjustment audit trail
- ✅ Low stock product queries

### LLM Integration
- ✅ `check_product_availability` - Search products and check stock
- ✅ `create_order` - Create order from chat message

## API Endpoints

### Products

```http
POST   /api/v1/products              # Create product
GET    /api/v1/products              # List products (with filters)
GET    /api/v1/products/:id          # Get product details
PUT    /api/v1/products/:id          # Update product
DELETE /api/v1/products/:id          # Delete product (soft delete)
PUT    /api/v1/products/:id/stock    # Adjust stock manually
GET    /api/v1/products/low-stock    # Get low stock products
```

### Orders

```http
POST   /api/v1/orders                # Create order
GET    /api/v1/orders                # List orders (with filters)
GET    /api/v1/orders/:id            # Get order details
PUT    /api/v1/orders/:id/status     # Update order status
PUT    /api/v1/orders/:id/payment    # Update payment status
DELETE /api/v1/orders/:id            # Cancel order (restores stock)
```

### Categories

```http
GET    /api/v1/categories            # List categories
```

### Health Check

```http
GET    /health                       # Service health status
```

## Database Schema

### Tables Created

1. **products** - Product catalog
2. **orders** - Customer orders
3. **order_items** - Order line items
4. **stock_adjustments** - Inventory audit log
5. **categories** - Product categories

### Sample Data

The migration includes sample products:
- Chocolate Cake (Rp 150,000, stock: 10)
- Red Velvet Cake (Rp 180,000, stock: 5)
- Vanilla Cupcakes (Rp 60,000, stock: 15)
- Brownie Box (Rp 80,000, stock: 8)
- Cheese Tart (Rp 45,000, stock: 2) - Low stock!

## Running the Service

### Docker Compose (Recommended)

```bash
# Start all services including order-service
cd infrastructure/docker
docker-compose up -d order-service

# View logs
docker-compose logs -f order-service

# Check health
curl http://localhost:3009/health
```

### Local Development

```bash
# Install dependencies
cd services/order-service
go mod download

# Set environment variables
export DATABASE_URL="postgresql://crm_user:crm_password@localhost:5432/crm_dev?sslmode=disable"
export PORT=3009
export GIN_MODE=debug

# Run the service
go run cmd/main.go
```

## Database Migration

Run the migration to create order management tables:

```bash
# Using docker-compose
cd infrastructure/docker
docker-compose exec -T postgres psql -U crm_user -d crm_dev < migrations/005_create_order_management_tables.sql

# Or manually connect to PostgreSQL
docker-compose exec postgres psql -U crm_user -d crm_dev
\i /docker-entrypoint-initdb.d/../../../migrations/005_create_order_management_tables.sql
```

## Example Usage

### 1. Create a Product

```bash
curl -X POST http://localhost:3009/api/v1/products \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: 00000000-0000-0000-0000-000000000001" \
  -d '{
    "name": "Strawberry Cake",
    "description": "Fresh strawberry cake with whipped cream",
    "price": 170000,
    "stock_quantity": 12,
    "low_stock_threshold": 3,
    "category": "Cakes",
    "sku": "CAKE-STRAW-20"
  }'
```

### 2. Search Products

```bash
curl "http://localhost:3009/api/v1/products?search=chocolate&status=active" \
  -H "X-Tenant-Id: 00000000-0000-0000-0000-000000000001"
```

### 3. Create an Order

```bash
curl -X POST http://localhost:3009/api/v1/orders \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: 00000000-0000-0000-0000-000000000001" \
  -d '{
    "customer_phone": "+6281234567890",
    "customer_name": "Ibu Siti",
    "items": [
      {
        "product_id": "<product-uuid>",
        "quantity": 2,
        "notes": "Extra chocolate frosting"
      }
    ],
    "pickup_delivery_date": "2025-11-10",
    "fulfillment_type": "pickup",
    "notes": "Pickup at 2 PM"
  }'
```

### 4. Check Low Stock Products

```bash
curl http://localhost:3009/api/v1/products/low-stock \
  -H "X-Tenant-Id: 00000000-0000-0000-0000-000000000001"
```

### 5. Update Order Status

```bash
curl -X PUT http://localhost:3009/api/v1/orders/<order-id>/status \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: 00000000-0000-0000-0000-000000000001" \
  -d '{"status": "confirmed"}'
```

## LLM Function Calling

The Order Service integrates with the LLM Orchestration Service for conversational ordering:

### Customer Message Example

```
Customer: "I want to order 2 chocolate cakes for Saturday"
```

### LLM Processing

1. **check_product_availability** → Finds "Chocolate Cake" product
2. **create_order** → Creates order with 2 chocolate cakes
3. **Response** → "Order confirmed! 2x Chocolate Cake (Rp 300.000). Pickup Saturday?"

### Function Definitions

**check_product_availability**:
```json
{
  "product_names": ["chocolate cake"]
}
```

**create_order**:
```json
{
  "customer_phone": "+6281234567890",
  "customer_name": "Customer from WhatsApp",
  "items": [
    {"product_id": "uuid", "quantity": 2}
  ],
  "pickup_date": "2025-11-09",
  "fulfillment_type": "pickup"
}
```

## Stock Management

### Automatic Stock Deduction

When an order is created:
1. Product stock is checked for availability
2. If sufficient stock exists, it's deducted atomically
3. Stock adjustment is logged with type `order_created`
4. If insufficient stock, order creation fails with error

### Order Cancellation

When an order is cancelled:
1. All order items are retrieved
2. Stock is restored for each item
3. Stock adjustment is logged with type `order_cancelled`
4. Order status is set to `cancelled`

### Manual Stock Adjustment

```bash
curl -X PUT http://localhost:3009/api/v1/products/<product-id>/stock \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: 00000000-0000-0000-0000-000000000001" \
  -d '{
    "adjustment": -3,
    "reason": "Damaged during transport"
  }'
```

## Order Status Workflow

```
pending → confirmed → preparing → ready → completed
                          ↓
                      cancelled
```

- **pending**: Order just created, awaiting confirmation
- **confirmed**: Order confirmed by admin/system
- **preparing**: Order is being prepared
- **ready**: Order ready for pickup/delivery
- **completed**: Order fulfilled
- **cancelled**: Order cancelled (stock restored)

## Payment Status

- **unpaid**: No payment received
- **partially_paid**: Partial payment (deposit)
- **paid**: Fully paid

## Currency

All prices are in **Indonesian Rupiah (IDR)**:
- Format: Rp 150.000 (with thousands separator)
- Storage: DECIMAL(12,2) - supports up to Rp 999,999,999.99

## Environment Variables

```bash
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=disable
PORT=3009
GIN_MODE=debug  # or "release" for production
```

## Error Handling

### Common Errors

**404 Not Found**:
```json
{"error": "Product not found"}
```

**400 Bad Request** (Insufficient Stock):
```json
{"error": "Insufficient stock for Chocolate Cake (available: 2, requested: 5)"}
```

**400 Bad Request** (Missing Tenant):
```json
{"error": "X-Tenant-Id header is required"}
```

## Monitoring

### Health Check

```bash
curl http://localhost:3009/health
```

Response:
```json
{
  "status": "healthy",
  "service": "order-service"
}
```

### Logs

```bash
# View real-time logs
docker-compose logs -f order-service

# View last 100 lines
docker-compose logs --tail=100 order-service
```

## Integration with Other Services

### Tenant Service
- Validates tenant_id from X-Tenant-Id header
- Multi-tenant data isolation

### LLM Orchestration Service
- Provides function calling for conversational ordering
- Endpoints: check_product_availability, create_order

### Conversation Service
- Links orders to conversations via conversation_id
- Enables order tracking in chat context

## Testing

### Unit Tests (TODO)

```bash
go test ./internal/...
```

### Integration Tests (TODO)

```bash
go test -tags=integration ./tests/integration/...
```

### Manual Testing

```bash
# Test full order flow
cd infrastructure/docker
./test-services.sh

# Or use the test script
./test-order-flow.sh
```

## Troubleshooting

### Service won't start

Check database connection:
```bash
docker-compose logs postgres
docker-compose exec postgres pg_isready -U crm_user
```

### Migration not applied

Run migration manually:
```bash
docker-compose exec -T postgres psql -U crm_user -d crm_dev < migrations/005_create_order_management_tables.sql
```

### Stock deduction not working

Check stock_adjustments table for audit trail:
```sql
SELECT * FROM stock_adjustments
WHERE product_id = '<product-uuid>'
ORDER BY adjusted_at DESC
LIMIT 10;
```

## Future Enhancements

### Phase 2 Features
- [ ] Product variants (size, color, flavor)
- [ ] Product images (Cloud Storage)
- [ ] Bulk pricing rules
- [ ] Combo/package products
- [ ] Recipe management (raw materials)
- [ ] Batch/lot tracking (expiry dates)
- [ ] Delivery fee calculation
- [ ] Invoice generation (PDF)

### Phase 3 Features
- [ ] Payment gateway integration (Midtrans/Xendit)
- [ ] Multi-location inventory
- [ ] Staff assignment (kitchen/delivery)
- [ ] Customer loyalty program
- [ ] Automated reorder alerts

## Contributing

When adding features:
1. Update database schema if needed
2. Add migration file
3. Update API documentation
4. Add tests
5. Update this README

## License

Internal project for WhatsApp CRM platform.

---

**Service Status**: ✅ POC Complete (7/8 tasks)
**Next Step**: Create frontend pages (Products & Orders)
**Documentation**: ORDER_MANAGEMENT_ANALYSIS.md
