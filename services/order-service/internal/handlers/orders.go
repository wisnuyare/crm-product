package handlers

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"order-service/internal/database"
	"order-service/internal/models"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// CreateOrder creates a new order with items and deducts stock
func CreateOrder(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-Id")
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "X-Tenant-Id header is required"})
		return
	}

	var req models.CreateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})
		return
	}

	// Start transaction
	tx, err := database.DB.Begin()
	if err != nil {
		log.Printf("Error starting transaction: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to create order"})
		return
	}
	defer tx.Rollback()

	// Generate order number using database function
	var orderNumber string
	err = tx.QueryRow("SELECT generate_order_number($1)", tenantID).Scan(&orderNumber)
	if err != nil {
		log.Printf("Error generating order number: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to generate order number"})
		return
	}

	orderID := uuid.New().String()

	// Step 1: Validate all items and calculate totals (but don't deduct stock yet)
	type ProductInfo struct {
		ID            string
		Name          string
		Price         float64
		CurrentStock  int
		RequestedQty  int
		ItemSubtotal  float64
		Notes         string
	}
	var subtotal float64
	productsToProcess := []ProductInfo{}

	for _, item := range req.Items {
		// Get product details and lock row
		var product models.Product
		err := tx.QueryRow(`
			SELECT id, name, price, stock_quantity
			FROM products
			WHERE id = $1 AND tenant_id = $2 AND status = 'active'
			FOR UPDATE
		`, item.ProductID, tenantID).Scan(&product.ID, &product.Name, &product.Price, &product.StockQuantity)

		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, models.ErrorResponse{Error: fmt.Sprintf("Product %s not found", item.ProductID)})
			return
		} else if err != nil {
			log.Printf("Error fetching product: %v", err)
			c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to fetch product"})
			return
		}

		// Check stock availability
		if product.StockQuantity < item.Quantity {
			c.JSON(http.StatusBadRequest, models.ErrorResponse{
				Error: fmt.Sprintf("Insufficient stock for %s (available: %d, requested: %d)", product.Name, product.StockQuantity, item.Quantity),
			})
			return
		}

		// Calculate item subtotal
		itemSubtotal := product.Price * float64(item.Quantity)
		subtotal += itemSubtotal

		// Store product info for later processing
		productsToProcess = append(productsToProcess, ProductInfo{
			ID:           product.ID,
			Name:         product.Name,
			Price:        product.Price,
			CurrentStock: product.StockQuantity,
			RequestedQty: item.Quantity,
			ItemSubtotal: itemSubtotal,
			Notes:        item.Notes,
		})
	}

	// Calculate total
	total := subtotal // No delivery fee or discount for POC

	// Parse pickup/delivery date
	var pickupDate sql.NullTime
	if req.PickupDeliveryDate != "" {
		t, err := time.Parse("2006-01-02", req.PickupDeliveryDate)
		if err == nil {
			pickupDate = sql.NullTime{Time: t, Valid: true}
		}
	}

	fulfillmentType := "pickup"
	if req.FulfillmentType != "" {
		fulfillmentType = req.FulfillmentType
	}

	// Create order
	orderQuery := `
		INSERT INTO orders (
			id, tenant_id, conversation_id, customer_phone, customer_name, customer_address,
			order_number, status, subtotal, delivery_fee, discount, total,
			payment_status, amount_paid, pickup_delivery_date, pickup_delivery_time,
			fulfillment_type, notes
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, 0, 0, $9, 'unpaid', 0, $10, $11, $12, $13)
		RETURNING id, created_at, updated_at
	`

	var createdAt, updatedAt time.Time
	err = tx.QueryRow(
		orderQuery,
		orderID, tenantID, nullString(req.ConversationID), req.CustomerPhone,
		nullString(req.CustomerName), nullString(req.CustomerAddress),
		orderNumber, subtotal, total, pickupDate, nullString(req.PickupDeliveryTime),
		fulfillmentType, nullString(req.Notes),
	).Scan(&orderID, &createdAt, &updatedAt)

	if err != nil {
		log.Printf("Error creating order: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to create order"})
		return
	}

	// Step 2: Now that order exists, process each item (create order_item, deduct stock, log adjustment)
	var orderItems []models.OrderItem
	for _, productInfo := range productsToProcess {
		// Create order item
		orderItemID := uuid.New().String()
		_, err := tx.Exec(`
			INSERT INTO order_items (id, order_id, product_id, product_name, product_price, quantity, subtotal, notes)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		`, orderItemID, orderID, productInfo.ID, productInfo.Name, productInfo.Price, productInfo.RequestedQty, productInfo.ItemSubtotal, nullString(productInfo.Notes))

		if err != nil {
			log.Printf("Error creating order item: %v", err)
			c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to create order item"})
			return
		}

		// Deduct stock
		newStock := productInfo.CurrentStock - productInfo.RequestedQty
		_, err = tx.Exec("UPDATE products SET stock_quantity = $1 WHERE id = $2", newStock, productInfo.ID)
		if err != nil {
			log.Printf("Error updating stock: %v", err)
			c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to update stock"})
			return
		}

		// Log stock adjustment (NOW order exists, so foreign key constraint is satisfied)
		_, err = tx.Exec(`
			INSERT INTO stock_adjustments (tenant_id, product_id, adjustment_type, quantity_change, previous_quantity, new_quantity, order_id, reason)
			VALUES ($1, $2, 'order_created', $3, $4, $5, $6, $7)
		`, tenantID, productInfo.ID, -productInfo.RequestedQty, productInfo.CurrentStock, newStock, orderID, "Stock deducted for order "+orderNumber)
		if err != nil {
			log.Printf("Error logging stock adjustment: %v", err)
			c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to log stock adjustment"})
			return
		}

		// Add to response items
		orderItems = append(orderItems, models.OrderItem{
			ID:           orderItemID,
			OrderID:      orderID,
			ProductID:    productInfo.ID,
			ProductName:  productInfo.Name,
			ProductPrice: productInfo.Price,
			Quantity:     productInfo.RequestedQty,
			Subtotal:     productInfo.ItemSubtotal,
			Notes:        sql.NullString{String: productInfo.Notes, Valid: productInfo.Notes != ""},
		})
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		log.Printf("Error committing transaction: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to commit order"})
		return
	}

	// Build response
	order := models.Order{
		ID:                 orderID,
		TenantID:           tenantID,
		ConversationID:     sql.NullString{String: req.ConversationID, Valid: req.ConversationID != ""},
		CustomerPhone:      req.CustomerPhone,
		CustomerName:       sql.NullString{String: req.CustomerName, Valid: req.CustomerName != ""},
		CustomerAddress:    sql.NullString{String: req.CustomerAddress, Valid: req.CustomerAddress != ""},
		OrderNumber:        orderNumber,
		Status:             "pending",
		Subtotal:           subtotal,
		DeliveryFee:        0,
		Discount:           0,
		Total:              total,
		PaymentStatus:      "unpaid",
		AmountPaid:         0,
		PickupDeliveryDate: pickupDate,
		PickupDeliveryTime: sql.NullString{String: req.PickupDeliveryTime, Valid: req.PickupDeliveryTime != ""},
		FulfillmentType:    fulfillmentType,
		Notes:              sql.NullString{String: req.Notes, Valid: req.Notes != ""},
		CreatedAt:          createdAt,
		UpdatedAt:          updatedAt,
		Items:              orderItems,
	}

	c.JSON(http.StatusCreated, order)
}

// GetOrders retrieves all orders for a tenant with optional filters
func GetOrders(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-Id")
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "X-Tenant-Id header is required"})
		return
	}

	// Parse query parameters
	status := c.Query("status")
	customerPhone := c.Query("customer_phone")
	limitStr := c.DefaultQuery("limit", "100")
	offsetStr := c.DefaultQuery("offset", "0")

	limit, _ := strconv.Atoi(limitStr)
	offset, _ := strconv.Atoi(offsetStr)

	// Build query
	query := `SELECT id, tenant_id, outlet_id, conversation_id, customer_phone, customer_name,
	          customer_address, order_number, status, subtotal, delivery_fee, discount, total,
	          payment_status, amount_paid, payment_method, pickup_delivery_date, pickup_delivery_time,
	          fulfillment_type, notes, created_at, updated_at, completed_at
	          FROM orders WHERE tenant_id = $1`
	args := []interface{}{tenantID}
	argCount := 1

	if status != "" {
		argCount++
		query += fmt.Sprintf(" AND status = $%d", argCount)
		args = append(args, status)
	}

	if customerPhone != "" {
		argCount++
		query += fmt.Sprintf(" AND customer_phone = $%d", argCount)
		args = append(args, customerPhone)
	}

	query += " ORDER BY created_at DESC"

	if limit > 0 {
		argCount++
		query += fmt.Sprintf(" LIMIT $%d", argCount)
		args = append(args, limit)
	}

	if offset > 0 {
		argCount++
		query += fmt.Sprintf(" OFFSET $%d", argCount)
		args = append(args, offset)
	}

	rows, err := database.DB.Query(query, args...)
	if err != nil {
		log.Printf("Error querying orders: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to fetch orders"})
		return
	}
	defer rows.Close()

	var orders []models.Order
	for rows.Next() {
		var o models.Order
		err := rows.Scan(
			&o.ID, &o.TenantID, &o.OutletID, &o.ConversationID, &o.CustomerPhone, &o.CustomerName,
			&o.CustomerAddress, &o.OrderNumber, &o.Status, &o.Subtotal, &o.DeliveryFee, &o.Discount,
			&o.Total, &o.PaymentStatus, &o.AmountPaid, &o.PaymentMethod, &o.PickupDeliveryDate,
			&o.PickupDeliveryTime, &o.FulfillmentType, &o.Notes, &o.CreatedAt, &o.UpdatedAt, &o.CompletedAt,
		)
		if err != nil {
			log.Printf("Error scanning order: %v", err)
			continue
		}

		// Fetch order items
		itemsQuery := `
			SELECT id, order_id, product_id, product_name, product_price, quantity, subtotal, notes, created_at
			FROM order_items WHERE order_id = $1
		`
		itemRows, err := database.DB.Query(itemsQuery, o.ID)
		if err != nil {
			log.Printf("Error fetching order items: %v", err)
			continue
		}

		var items []models.OrderItem
		for itemRows.Next() {
			var item models.OrderItem
			err := itemRows.Scan(
				&item.ID, &item.OrderID, &item.ProductID, &item.ProductName, &item.ProductPrice,
				&item.Quantity, &item.Subtotal, &item.Notes, &item.CreatedAt,
			)
			if err != nil {
				log.Printf("Error scanning order item: %v", err)
				continue
			}
			items = append(items, item)
		}
		itemRows.Close()

		o.Items = items
		orders = append(orders, o)
	}

	// Get total count
	countQuery := "SELECT COUNT(*) FROM orders WHERE tenant_id = $1"
	countArgs := []interface{}{tenantID}
	if status != "" {
		countQuery += " AND status = $2"
		countArgs = append(countArgs, status)
	}

	var total int
	database.DB.QueryRow(countQuery, countArgs...).Scan(&total)

	c.JSON(http.StatusOK, models.OrdersResponse{
		Orders: orders,
		Total:  total,
	})
}

// GetOrder retrieves a single order by ID
func GetOrder(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-Id")
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "X-Tenant-Id header is required"})
		return
	}

	orderID := c.Param("id")

	query := `
		SELECT id, tenant_id, outlet_id, conversation_id, customer_phone, customer_name,
		       customer_address, order_number, status, subtotal, delivery_fee, discount, total,
		       payment_status, amount_paid, payment_method, pickup_delivery_date, pickup_delivery_time,
		       fulfillment_type, notes, created_at, updated_at, completed_at
		FROM orders
		WHERE id = $1 AND tenant_id = $2
	`

	var order models.Order
	err := database.DB.QueryRow(query, orderID, tenantID).Scan(
		&order.ID, &order.TenantID, &order.OutletID, &order.ConversationID, &order.CustomerPhone,
		&order.CustomerName, &order.CustomerAddress, &order.OrderNumber, &order.Status, &order.Subtotal,
		&order.DeliveryFee, &order.Discount, &order.Total, &order.PaymentStatus, &order.AmountPaid,
		&order.PaymentMethod, &order.PickupDeliveryDate, &order.PickupDeliveryTime, &order.FulfillmentType,
		&order.Notes, &order.CreatedAt, &order.UpdatedAt, &order.CompletedAt,
	)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Order not found"})
		return
	} else if err != nil {
		log.Printf("Error fetching order: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to fetch order"})
		return
	}

	// Fetch order items
	itemsQuery := `
		SELECT id, order_id, product_id, product_name, product_price, quantity, subtotal, notes, created_at
		FROM order_items WHERE order_id = $1
	`
	itemRows, err := database.DB.Query(itemsQuery, order.ID)
	if err != nil {
		log.Printf("Error fetching order items: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to fetch order items"})
		return
	}
	defer itemRows.Close()

	var items []models.OrderItem
	for itemRows.Next() {
		var item models.OrderItem
		err := itemRows.Scan(
			&item.ID, &item.OrderID, &item.ProductID, &item.ProductName, &item.ProductPrice,
			&item.Quantity, &item.Subtotal, &item.Notes, &item.CreatedAt,
		)
		if err != nil {
			log.Printf("Error scanning order item: %v", err)
			continue
		}
		items = append(items, item)
	}

	order.Items = items
	c.JSON(http.StatusOK, order)
}

// UpdateOrderStatus updates the status of an order
func UpdateOrderStatus(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-Id")
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "X-Tenant-Id header is required"})
		return
	}

	orderID := c.Param("id")

	var req models.UpdateOrderStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})
		return
	}

	// Validate status
	validStatuses := map[string]bool{
		"pending": true, "confirmed": true, "preparing": true,
		"ready": true, "completed": true, "cancelled": true,
	}
	if !validStatuses[req.Status] {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Invalid status"})
		return
	}

	// Update order status
	query := "UPDATE orders SET status = $1, completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END WHERE id = $2 AND tenant_id = $3"
	result, err := database.DB.Exec(query, req.Status, orderID, tenantID)
	if err != nil {
		log.Printf("Error updating order status: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to update order status"})
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Order not found"})
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponse{
		Message: "Order status updated successfully",
		Data:    map[string]interface{}{"status": req.Status},
	})
}

// UpdatePaymentStatus updates the payment status of an order
func UpdatePaymentStatus(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-Id")
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "X-Tenant-Id header is required"})
		return
	}

	orderID := c.Param("id")

	var req models.UpdatePaymentStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})
		return
	}

	query := `
		UPDATE orders
		SET payment_status = $1, amount_paid = $2, payment_method = $3
		WHERE id = $4 AND tenant_id = $5
	`
	result, err := database.DB.Exec(query, req.PaymentStatus, req.AmountPaid, nullString(req.PaymentMethod), orderID, tenantID)
	if err != nil {
		log.Printf("Error updating payment status: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to update payment status"})
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Order not found"})
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponse{Message: "Payment status updated successfully"})
}

// CancelOrder cancels an order and restores stock
func CancelOrder(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-Id")
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "X-Tenant-Id header is required"})
		return
	}

	orderID := c.Param("id")

	// Start transaction
	tx, err := database.DB.Begin()
	if err != nil {
		log.Printf("Error starting transaction: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to cancel order"})
		return
	}
	defer tx.Rollback()

	// Get order items to restore stock
	itemsQuery := "SELECT product_id, quantity FROM order_items WHERE order_id = $1"
	itemRows, err := tx.Query(itemsQuery, orderID)
	if err != nil {
		log.Printf("Error fetching order items: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to fetch order items"})
		return
	}
	defer itemRows.Close()

	// Restore stock for each item
	for itemRows.Next() {
		var productID string
		var quantity int
		err := itemRows.Scan(&productID, &quantity)
		if err != nil {
			log.Printf("Error scanning order item: %v", err)
			continue
		}

		// Get current stock
		var currentStock int
		err = tx.QueryRow("SELECT stock_quantity FROM products WHERE id = $1", productID).Scan(&currentStock)
		if err != nil {
			log.Printf("Error fetching product stock: %v", err)
			continue
		}

		// Restore stock
		newStock := currentStock + quantity
		_, err = tx.Exec("UPDATE products SET stock_quantity = $1 WHERE id = $2", newStock, productID)
		if err != nil {
			log.Printf("Error restoring stock: %v", err)
			continue
		}

		// Log stock adjustment
		_, err = tx.Exec(`
			INSERT INTO stock_adjustments (tenant_id, product_id, adjustment_type, quantity_change, previous_quantity, new_quantity, order_id, reason)
			VALUES ($1, $2, 'order_cancelled', $3, $4, $5, $6, $7)
		`, tenantID, productID, quantity, currentStock, newStock, orderID, "Stock restored from cancelled order")
		if err != nil {
			log.Printf("Error logging stock adjustment: %v", err)
		}
	}

	// Update order status to cancelled
	_, err = tx.Exec("UPDATE orders SET status = 'cancelled' WHERE id = $1 AND tenant_id = $2", orderID, tenantID)
	if err != nil {
		log.Printf("Error updating order status: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to cancel order"})
		return
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		log.Printf("Error committing transaction: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to commit cancellation"})
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponse{Message: "Order cancelled and stock restored successfully"})
}
