package models

import (
	"database/sql"
	"time"
)

// Product represents a product in the catalog
type Product struct {
	ID                 string         `json:"id"`
	TenantID           string         `json:"tenant_id"`
	Name               string         `json:"name"`
	Description        sql.NullString `json:"description"`
	Price              float64        `json:"price"`
	StockQuantity      int            `json:"stock_quantity"`
	LowStockThreshold  int            `json:"low_stock_threshold"`
	Category           sql.NullString `json:"category"`
	SKU                sql.NullString `json:"sku"`
	Status             string         `json:"status"`
	CreatedAt          time.Time      `json:"created_at"`
	UpdatedAt          time.Time      `json:"updated_at"`
}

// CreateProductRequest represents the request body for creating a product
type CreateProductRequest struct {
	Name              string  `json:"name" binding:"required"`
	Description       string  `json:"description"`
	Price             float64 `json:"price" binding:"required,min=0"`
	StockQuantity     int     `json:"stock_quantity" binding:"min=0"`
	LowStockThreshold int     `json:"low_stock_threshold" binding:"min=0"`
	Category          string  `json:"category"`
	SKU               string  `json:"sku"`
}

// UpdateProductRequest represents the request body for updating a product
type UpdateProductRequest struct {
	Name              string  `json:"name"`
	Description       string  `json:"description"`
	Price             float64 `json:"price" binding:"min=0"`
	StockQuantity     *int    `json:"stock_quantity"` // Pointer to allow null
	LowStockThreshold *int    `json:"low_stock_threshold"`
	Category          string  `json:"category"`
	SKU               string  `json:"sku"`
	Status            string  `json:"status"`
}

// StockAdjustmentRequest represents the request body for adjusting stock
type StockAdjustmentRequest struct {
	Adjustment int    `json:"adjustment" binding:"required"` // Can be positive or negative
	Reason     string `json:"reason"`
}

// Order represents a customer order
type Order struct {
	ID                  string         `json:"id"`
	TenantID            string         `json:"tenant_id"`
	OutletID            sql.NullString `json:"outlet_id"`
	ConversationID      sql.NullString `json:"conversation_id"`
	CustomerPhone       string         `json:"customer_phone"`
	CustomerName        sql.NullString `json:"customer_name"`
	CustomerAddress     sql.NullString `json:"customer_address"`
	OrderNumber         string         `json:"order_number"`
	Status              string         `json:"status"`
	Subtotal            float64        `json:"subtotal"`
	DeliveryFee         float64        `json:"delivery_fee"`
	Discount            float64        `json:"discount"`
	Total               float64        `json:"total"`
	PaymentStatus       string         `json:"payment_status"`
	AmountPaid          float64        `json:"amount_paid"`
	PaymentMethod       sql.NullString `json:"payment_method"`
	PickupDeliveryDate  sql.NullTime   `json:"pickup_delivery_date"`
	PickupDeliveryTime  sql.NullString `json:"pickup_delivery_time"`
	FulfillmentType     string         `json:"fulfillment_type"`
	Notes               sql.NullString `json:"notes"`
	CreatedAt           time.Time      `json:"created_at"`
	UpdatedAt           time.Time      `json:"updated_at"`
	CompletedAt         sql.NullTime   `json:"completed_at"`
	Items               []OrderItem    `json:"items,omitempty"`
}

// OrderItem represents a single item in an order
type OrderItem struct {
	ID           string         `json:"id"`
	OrderID      string         `json:"order_id"`
	ProductID    string         `json:"product_id"`
	ProductName  string         `json:"product_name"`
	ProductPrice float64        `json:"product_price"`
	Quantity     int            `json:"quantity"`
	Subtotal     float64        `json:"subtotal"`
	Notes        sql.NullString `json:"notes"`
	CreatedAt    time.Time      `json:"created_at"`
}

// CreateOrderRequest represents the request body for creating an order
type CreateOrderRequest struct {
	ConversationID     string          `json:"conversation_id"`
	CustomerPhone      string          `json:"customer_phone" binding:"required"`
	CustomerName       string          `json:"customer_name"`
	CustomerAddress    string          `json:"customer_address"`
	Items              []OrderItemReq  `json:"items" binding:"required,min=1"`
	PickupDeliveryDate string          `json:"pickup_delivery_date"` // YYYY-MM-DD
	PickupDeliveryTime string          `json:"pickup_delivery_time"` // e.g. "14:00" or "2 PM"
	FulfillmentType    string          `json:"fulfillment_type"`     // pickup or delivery
	Notes              string          `json:"notes"`
}

// OrderItemReq represents an item in the create order request
type OrderItemReq struct {
	ProductID string `json:"product_id" binding:"required"`
	Quantity  int    `json:"quantity" binding:"required,min=1"`
	Notes     string `json:"notes"`
}

// UpdateOrderStatusRequest represents the request body for updating order status
type UpdateOrderStatusRequest struct {
	Status string `json:"status" binding:"required"`
}

// UpdatePaymentStatusRequest represents the request body for updating payment status
type UpdatePaymentStatusRequest struct {
	PaymentStatus string  `json:"payment_status" binding:"required"`
	AmountPaid    float64 `json:"amount_paid" binding:"min=0"`
	PaymentMethod string  `json:"payment_method"`
}

// StockAdjustment represents a stock change log entry
type StockAdjustment struct {
	ID               string         `json:"id"`
	TenantID         string         `json:"tenant_id"`
	ProductID        string         `json:"product_id"`
	AdjustmentType   string         `json:"adjustment_type"`
	QuantityChange   int            `json:"quantity_change"`
	PreviousQuantity int            `json:"previous_quantity"`
	NewQuantity      int            `json:"new_quantity"`
	OrderID          sql.NullString `json:"order_id"`
	Reason           sql.NullString `json:"reason"`
	AdjustedBy       sql.NullString `json:"adjusted_by"`
	AdjustedAt       time.Time      `json:"adjusted_at"`
}

// Category represents a product category
type Category struct {
	ID           string         `json:"id"`
	TenantID     string         `json:"tenant_id"`
	Name         string         `json:"name"`
	Description  sql.NullString `json:"description"`
	DisplayOrder int            `json:"display_order"`
	CreatedAt    time.Time      `json:"created_at"`
}

// ProductSearchQuery represents query parameters for product search
type ProductSearchQuery struct {
	Search   string
	Category string
	Status   string
	Limit    int
	Offset   int
}

// OrderSearchQuery represents query parameters for order search
type OrderSearchQuery struct {
	Status         string
	CustomerPhone  string
	FromDate       string
	ToDate         string
	PaymentStatus  string
	Limit          int
	Offset         int
}

// Response structures
type ProductsResponse struct {
	Products []Product `json:"products"`
	Total    int       `json:"total"`
}

type OrdersResponse struct {
	Orders []Order `json:"orders"`
	Total  int     `json:"total"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

type SuccessResponse struct {
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}
