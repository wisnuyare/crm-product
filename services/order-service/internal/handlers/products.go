package handlers

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"order-service/internal/database"
	"order-service/internal/models"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// CreateProduct creates a new product
func CreateProduct(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-Id")
	log.Printf("[DEBUG] CreateProduct - Received X-Tenant-Id header: '%s'", tenantID)
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "X-Tenant-Id header is required"})
		return
	}

	var req models.CreateProductRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})
		return
	}

	log.Printf("[DEBUG] CreateProduct - About to insert product with tenant_id: '%s', product_name: '%s'", tenantID, req.Name)

	// Generate UUID
	productID := uuid.New().String()

	query := `
		INSERT INTO products (id, tenant_id, name, description, price, stock_quantity, low_stock_threshold, category, sku, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
		RETURNING id, tenant_id, name, description, price, stock_quantity, low_stock_threshold, category, sku, status, created_at, updated_at
	`

	var product models.Product
	err := database.DB.QueryRow(
		query,
		productID, tenantID, req.Name, nullString(req.Description), req.Price,
		req.StockQuantity, req.LowStockThreshold, nullString(req.Category), nullString(req.SKU),
	).Scan(
		&product.ID, &product.TenantID, &product.Name, &product.Description, &product.Price,
		&product.StockQuantity, &product.LowStockThreshold, &product.Category, &product.SKU,
		&product.Status, &product.CreatedAt, &product.UpdatedAt,
	)

	if err != nil {
		log.Printf("Error creating product: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to create product"})
		return
	}

	c.JSON(http.StatusCreated, product)
}

// GetProducts retrieves all products for a tenant with optional filters
func GetProducts(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-Id")
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "X-Tenant-Id header is required"})
		return
	}

	// Parse query parameters
	search := c.Query("search")
	category := c.Query("category")
	status := c.DefaultQuery("status", "")
	limitStr := c.DefaultQuery("limit", "100")
	offsetStr := c.DefaultQuery("offset", "0")

	limit, _ := strconv.Atoi(limitStr)
	offset, _ := strconv.Atoi(offsetStr)

	// Build query
	query := `SELECT id, tenant_id, name, description, price, stock_quantity, low_stock_threshold,
	          category, sku, status, created_at, updated_at
	          FROM products WHERE tenant_id = $1`
	args := []interface{}{tenantID}
	argCount := 1

	if search != "" {
		argCount++
		query += fmt.Sprintf(" AND (name ILIKE $%d OR description ILIKE $%d OR sku ILIKE $%d)", argCount, argCount, argCount)
		args = append(args, "%"+search+"%")
	}

	if category != "" {
		argCount++
		query += fmt.Sprintf(" AND category = $%d", argCount)
		args = append(args, category)
	}

	if status != "" {
		argCount++
		query += fmt.Sprintf(" AND status = $%d", argCount)
		args = append(args, status)
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
		log.Printf("Error querying products: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to fetch products"})
		return
	}
	defer rows.Close()

	var products []models.Product
	for rows.Next() {
		var p models.Product
		err := rows.Scan(
			&p.ID, &p.TenantID, &p.Name, &p.Description, &p.Price,
			&p.StockQuantity, &p.LowStockThreshold, &p.Category, &p.SKU,
			&p.Status, &p.CreatedAt, &p.UpdatedAt,
		)
		if err != nil {
			log.Printf("Error scanning product: %v", err)
			continue
		}
		products = append(products, p)
	}

	// Get total count
	countQuery := "SELECT COUNT(*) FROM products WHERE tenant_id = $1"
	countArgs := []interface{}{tenantID}
	if search != "" {
		countQuery += " AND (name ILIKE $2 OR description ILIKE $2 OR sku ILIKE $2)"
		countArgs = append(countArgs, "%"+search+"%")
	}

	var total int
	database.DB.QueryRow(countQuery, countArgs...).Scan(&total)

	c.JSON(http.StatusOK, models.ProductsResponse{
		Products: products,
		Total:    total,
	})
}

// GetProduct retrieves a single product by ID
func GetProduct(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-Id")
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "X-Tenant-Id header is required"})
		return
	}

	productID := c.Param("id")

	query := `
		SELECT id, tenant_id, name, description, price, stock_quantity, low_stock_threshold,
		       category, sku, status, created_at, updated_at
		FROM products
		WHERE id = $1 AND tenant_id = $2
	`

	var product models.Product
	err := database.DB.QueryRow(query, productID, tenantID).Scan(
		&product.ID, &product.TenantID, &product.Name, &product.Description, &product.Price,
		&product.StockQuantity, &product.LowStockThreshold, &product.Category, &product.SKU,
		&product.Status, &product.CreatedAt, &product.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Product not found"})
		return
	} else if err != nil {
		log.Printf("Error fetching product: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to fetch product"})
		return
	}

	c.JSON(http.StatusOK, product)
}

// UpdateProduct updates a product
func UpdateProduct(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-Id")
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "X-Tenant-Id header is required"})
		return
	}

	productID := c.Param("id")

	var req models.UpdateProductRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})
		return
	}

	query := `
		UPDATE products
		SET name = COALESCE(NULLIF($1, ''), name),
		    description = COALESCE(NULLIF($2, ''), description),
		    price = COALESCE(NULLIF($3, 0), price),
		    category = COALESCE(NULLIF($4, ''), category),
		    sku = COALESCE(NULLIF($5, ''), sku),
		    status = COALESCE(NULLIF($6, ''), status)
		WHERE id = $7 AND tenant_id = $8
		RETURNING id, tenant_id, name, description, price, stock_quantity, low_stock_threshold,
		          category, sku, status, created_at, updated_at
	`

	var product models.Product
	err := database.DB.QueryRow(
		query,
		req.Name, req.Description, req.Price, req.Category, req.SKU, req.Status,
		productID, tenantID,
	).Scan(
		&product.ID, &product.TenantID, &product.Name, &product.Description, &product.Price,
		&product.StockQuantity, &product.LowStockThreshold, &product.Category, &product.SKU,
		&product.Status, &product.CreatedAt, &product.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Product not found"})
		return
	} else if err != nil {
		log.Printf("Error updating product: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to update product"})
		return
	}

	c.JSON(http.StatusOK, product)
}

// DeleteProduct soft deletes a product (sets status to inactive)
func DeleteProduct(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-Id")
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "X-Tenant-Id header is required"})
		return
	}

	productID := c.Param("id")

	query := "UPDATE products SET status = 'inactive' WHERE id = $1 AND tenant_id = $2"
	result, err := database.DB.Exec(query, productID, tenantID)
	if err != nil {
		log.Printf("Error deleting product: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to delete product"})
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Product not found"})
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponse{Message: "Product deleted successfully"})
}

// AdjustStock manually adjusts product stock
func AdjustStock(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-Id")
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "X-Tenant-Id header is required"})
		return
	}

	productID := c.Param("id")

	var req models.StockAdjustmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})
		return
	}

	// Start transaction
	tx, err := database.DB.Begin()
	if err != nil {
		log.Printf("Error starting transaction: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to adjust stock"})
		return
	}
	defer tx.Rollback()

	// Get current stock
	var currentStock int
	err = tx.QueryRow("SELECT stock_quantity FROM products WHERE id = $1 AND tenant_id = $2", productID, tenantID).Scan(&currentStock)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.ErrorResponse{Error: "Product not found"})
		return
	} else if err != nil {
		log.Printf("Error fetching product stock: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to fetch product stock"})
		return
	}

	newStock := currentStock + req.Adjustment
	if newStock < 0 {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "Insufficient stock"})
		return
	}

	// Update stock
	_, err = tx.Exec("UPDATE products SET stock_quantity = $1 WHERE id = $2 AND tenant_id = $3", newStock, productID, tenantID)
	if err != nil {
		log.Printf("Error updating stock: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to update stock"})
		return
	}

	// Log stock adjustment
	adjustmentType := "manual_add"
	if req.Adjustment < 0 {
		adjustmentType = "manual_remove"
	}

	_, err = tx.Exec(`
		INSERT INTO stock_adjustments (tenant_id, product_id, adjustment_type, quantity_change, previous_quantity, new_quantity, reason)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, tenantID, productID, adjustmentType, req.Adjustment, currentStock, newStock, nullString(req.Reason))

	if err != nil {
		log.Printf("Error logging stock adjustment: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to log stock adjustment"})
		return
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		log.Printf("Error committing transaction: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to commit stock adjustment"})
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponse{
		Message: "Stock adjusted successfully",
		Data: map[string]interface{}{
			"previous_quantity": currentStock,
			"adjustment":        req.Adjustment,
			"new_quantity":      newStock,
		},
	})
}

// GetLowStockProducts retrieves products below their low stock threshold
func GetLowStockProducts(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-Id")
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{Error: "X-Tenant-Id header is required"})
		return
	}

	query := `
		SELECT id, tenant_id, name, description, price, stock_quantity, low_stock_threshold,
		       category, sku, status, created_at, updated_at
		FROM products
		WHERE tenant_id = $1 AND status = 'active' AND stock_quantity <= low_stock_threshold
		ORDER BY stock_quantity ASC
	`

	rows, err := database.DB.Query(query, tenantID)
	if err != nil {
		log.Printf("Error querying low stock products: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{Error: "Failed to fetch low stock products"})
		return
	}
	defer rows.Close()

	var products []models.Product
	for rows.Next() {
		var p models.Product
		err := rows.Scan(
			&p.ID, &p.TenantID, &p.Name, &p.Description, &p.Price,
			&p.StockQuantity, &p.LowStockThreshold, &p.Category, &p.SKU,
			&p.Status, &p.CreatedAt, &p.UpdatedAt,
		)
		if err != nil {
			log.Printf("Error scanning product: %v", err)
			continue
		}
		products = append(products, p)
	}

	c.JSON(http.StatusOK, models.ProductsResponse{
		Products: products,
		Total:    len(products),
	})
}

// Helper function to create sql.NullString
func nullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{Valid: false}
	}
	return sql.NullString{String: s, Valid: true}
}
