package handlers

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"io/ioutil"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	_ "github.com/lib/pq" // Import the postgres driver
	"order-service/internal/database"
	"order-service/internal/models"
)

// setupTestDB connects to the test PostgreSQL database and applies the schema.
// NOTE: This test requires a running PostgreSQL database container.
// Run 'docker-compose up -d postgres' in the 'infrastructure/docker' directory.
func setupTestDB(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://crm_user:crm_password@localhost:5432/crm_dev?sslmode=disable"
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		t.Fatalf("Failed to connect to test database: %v", err)
	}

	if err := db.Ping(); err != nil {
		t.Fatalf("Failed to ping test database: %v. Make sure the Postgres container is running.", err)
	}

	// Drop tables to ensure a clean slate for each test run
	dropSQL := `
		DROP TABLE IF EXISTS stock_adjustments CASCADE;
		DROP TABLE IF EXISTS order_items CASCADE;
		DROP TABLE IF EXISTS orders CASCADE;
		DROP TABLE IF EXISTS products CASCADE;
		DROP TABLE IF EXISTS categories CASCADE;
		DROP TABLE IF EXISTS tenants CASCADE; -- Also drop tenants to ensure clean state
		DROP TABLE IF EXISTS outlets CASCADE; -- Also drop outlets
		DROP TABLE IF EXISTS users CASCADE; -- Also drop users
		DROP TABLE IF EXISTS subscriptions CASCADE; -- Also drop subscriptions
		DROP TABLE IF EXISTS usage_records CASCADE; -- Also drop usage_records
		DROP TABLE IF EXISTS deposits CASCADE; -- Also drop deposits
		DROP TABLE IF EXISTS knowledge_bases CASCADE; -- Also drop knowledge_bases
		DROP TABLE IF EXISTS documents CASCADE; -- Also drop documents
		DROP TABLE IF EXISTS conversations CASCADE; -- Also drop conversations
		DROP TABLE IF EXISTS messages CASCADE; -- Also drop messages
	`
	_, err = db.Exec(dropSQL)
	if err != nil {
		t.Fatalf("Failed to drop tables: %v", err)
	}

	// Read the init-db.sql file to set up the base schema (including tenants)
	initDBSchema, err := ioutil.ReadFile("../../../../infrastructure/docker/init-db.sql")
	if err != nil {
		t.Fatalf("Failed to read init-db.sql file: %v", err)
	}
	_, err = db.Exec(string(initDBSchema))
	if err != nil {
		t.Fatalf("Failed to apply init-db.sql schema: %v", err)
	}

	// Read the migration file to set up the order-service schema
	orderServiceSchema, err := ioutil.ReadFile("../../../../infrastructure/docker/migrations/005_create_order_management_tables.sql")
	if err != nil {
		t.Fatalf("Failed to read order-service migration file: %v", err)
	}
	_, err = db.Exec(string(orderServiceSchema))
	if err != nil {
		t.Fatalf("Failed to apply order-service schema: %v", err)
	}

	// Set the global DB variable for the handlers to use
	database.DB = db
}

// setupTestRouter creates a new Gin router for testing.
func setupTestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/api/v1/products", CreateProduct)
	router.GET("/api/v1/products/:id", GetProduct)
	router.PUT("/api/v1/products/:id", UpdateProduct)
	router.DELETE("/api/v1/products/:id", DeleteProduct)
	return router
}

// createTestProduct is a helper function to create a product for testing.
func createTestProduct(t *testing.T, router *gin.Engine) models.Product {
	newProduct := models.CreateProductRequest{
		Name:              "Test Cake",
		Description:       "A delicious cake for testing.",
		Price:             150000,
		StockQuantity:     10,
		LowStockThreshold: 5,
		Category:          "Cakes",
		SKU:               "CAKE-TEST-01",
	}
	payload, _ := json.Marshal(newProduct)

	req, _ := http.NewRequest(http.MethodPost, "/api/v1/products", bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Tenant-Id", "00000000-0000-0000-0000-000000000001")

	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("Failed to create test product, status code: %d", w.Code)
	}

	var createdProduct models.Product
	err := json.Unmarshal(w.Body.Bytes(), &createdProduct)
	if err != nil {
		t.Fatalf("Failed to unmarshal created product: %v", err)
	}

	return createdProduct
}

// clearTables is a helper to clean up the database after a test.
// This is now redundant as setupTestDB drops tables, but kept for clarity if needed elsewhere.
func clearTables(t *testing.T, db *sql.DB) {
	// Order matters due to foreign key constraints
	_, err := db.Exec("DELETE FROM stock_adjustments; DELETE FROM order_items; DELETE FROM orders; DELETE FROM products; DELETE FROM categories;")
	if err != nil {
		t.Fatalf("Failed to clear tables: %v", err)
	}
}

// TestCreateProductHandler tests the product creation endpoint against a real Postgres DB.
func TestCreateProductHandler(t *testing.T) {
	// 1. Setup
	setupTestDB(t)
	defer database.DB.Close()

	// Clear tables after the test (setupTestDB already clears before)
	defer clearTables(t, database.DB)

	router := setupTestRouter()

	// 2. Test Case: Successful creation
	t.Run("Successful Product Creation", func(t *testing.T) {
		// Create a product payload
		newProduct := models.CreateProductRequest{
			Name:              "Test Cake",
			Description:       "A delicious cake for testing.",
			Price:             150000,
			StockQuantity:     10,
			LowStockThreshold: 5,
			Category:          "Cakes",
			SKU:               "CAKE-TEST-01",
		}
		payload, _ := json.Marshal(newProduct)

		// Create the HTTP request
		req, _ := http.NewRequest(http.MethodPost, "/api/v1/products", bytes.NewBuffer(payload))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Tenant-Id", "00000000-0000-0000-0000-000000000001")

		w := httptest.NewRecorder()

		// 3. Execution
		router.ServeHTTP(w, req)

		// 4. Assertions
		if w.Code != http.StatusCreated {
			t.Errorf("Expected status code %d, but got %d", http.StatusCreated, w.Code)
			t.Logf("Response body: %s", w.Body.String())
		}

		var responseProduct models.Product
		err := json.Unmarshal(w.Body.Bytes(), &responseProduct)
		if err != nil {
			t.Fatalf("Failed to unmarshal response body: %v", err)
		}

		if responseProduct.Name != newProduct.Name {
			t.Errorf("Expected product name '%s', but got '%s'", newProduct.Name, responseProduct.Name)
		}
		if responseProduct.Price != newProduct.Price {
			t.Errorf("Expected product price %f, but got %f", newProduct.Price, responseProduct.Price)
		}
		if responseProduct.StockQuantity != newProduct.StockQuantity {
			t.Errorf("Expected product stock %d, but got %d", newProduct.StockQuantity, responseProduct.StockQuantity)
		}
	})

	t.Run("Invalid Product Creation - Missing Name", func(t *testing.T) {
		// Create an invalid product payload (missing Name)
		invalidProduct := models.CreateProductRequest{
			Description:       "A delicious cake for testing.",
			Price:             150000,
			StockQuantity:     10,
			LowStockThreshold: 5,
			Category:          "Cakes",
			SKU:               "CAKE-TEST-01",
		}
		payload, _ := json.Marshal(invalidProduct)

		req, _ := http.NewRequest(http.MethodPost, "/api/v1/products", bytes.NewBuffer(payload))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Tenant-Id", "00000000-0000-0000-0000-000000000001")

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("Expected status code %d, but got %d", http.StatusBadRequest, w.Code)
			t.Logf("Response body: %s", w.Body.String())
		}

		// Optionally, check for a specific error message in the body
		// var errorResponse map[string]string
		// json.Unmarshal(w.Body.Bytes(), &errorResponse)
		// if errorResponse["error"] != "Name is required" {
		// 	t.Errorf("Expected error message 'Name is required', but got '%s'", errorResponse["error"])
		// }
	})
}

func TestGetProductHandler(t *testing.T) {
	// 1. Setup
	setupTestDB(t)
	defer database.DB.Close()
	router := setupTestRouter()

	// 2. Test Case: Successful retrieval
	t.Run("Successful Product Retrieval", func(t *testing.T) {
		// Create a product to retrieve
		createdProduct := createTestProduct(t, router)

		// Create the HTTP request
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/products/"+createdProduct.ID, nil)
		req.Header.Set("X-Tenant-Id", "00000000-0000-0000-0000-000000000001")

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		// Assertions
		if w.Code != http.StatusOK {
			t.Errorf("Expected status code %d, but got %d", http.StatusOK, w.Code)
			t.Logf("Response body: %s", w.Body.String())
		}

		var retrievedProduct models.Product
		err := json.Unmarshal(w.Body.Bytes(), &retrievedProduct)
		if err != nil {
			t.Fatalf("Failed to unmarshal response body: %v", err)
		}

		if retrievedProduct.ID != createdProduct.ID {
			t.Errorf("Expected product ID '%s', but got '%s'", createdProduct.ID, retrievedProduct.ID)
		}
		if retrievedProduct.Name != createdProduct.Name {
			t.Errorf("Expected product name '%s', but got '%s'", createdProduct.Name, retrievedProduct.Name)
		}
	})

	// 3. Test Case: Product not found
	t.Run("Product Not Found", func(t *testing.T) {
		// Create the HTTP request with a non-existent but valid UUID
		nonExistentUUID := uuid.New().String()
		req, _ := http.NewRequest(http.MethodGet, "/api/v1/products/"+nonExistentUUID, nil)
		req.Header.Set("X-Tenant-Id", "00000000-0000-0000-0000-000000000001")

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		// Assertions
		if w.Code != http.StatusNotFound {
			t.Errorf("Expected status code %d, but got %d", http.StatusNotFound, w.Code)
			t.Logf("Response body: %s", w.Body.String())
		}
	})
}

func TestUpdateProductHandler(t *testing.T) {
	// 1. Setup
	setupTestDB(t)
	defer database.DB.Close()
	router := setupTestRouter()

	// 2. Test Case: Successful update
	t.Run("Successful Product Update", func(t *testing.T) {
		// Create a product to update
		createdProduct := createTestProduct(t, router)

		// Create the update payload
		updatePayload := models.UpdateProductRequest{
			Name:        "Updated Test Cake",
			Description: "An updated delicious cake for testing.",
			Price:       200000,
		}
		payload, _ := json.Marshal(updatePayload)

		// Create the HTTP request
		req, _ := http.NewRequest(http.MethodPut, "/api/v1/products/"+createdProduct.ID, bytes.NewBuffer(payload))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Tenant-Id", "00000000-0000-0000-0000-000000000001")

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		// Assertions
		if w.Code != http.StatusOK {
			t.Errorf("Expected status code %d, but got %d", http.StatusOK, w.Code)
			t.Logf("Response body: %s", w.Body.String())
		}

		var updatedProduct models.Product
		err := json.Unmarshal(w.Body.Bytes(), &updatedProduct)
		if err != nil {
			t.Fatalf("Failed to unmarshal response body: %v", err)
		}

		if updatedProduct.Name != updatePayload.Name {
			t.Errorf("Expected product name '%s', but got '%s'", updatePayload.Name, updatedProduct.Name)
		}
		if updatedProduct.Price != updatePayload.Price {
			t.Errorf("Expected product price %f, but got %f", updatePayload.Price, updatedProduct.Price)
		}
	})

	// 3. Test Case: Product not found
	t.Run("Product Not Found on Update", func(t *testing.T) {
		// Create the update payload
		updatePayload := models.UpdateProductRequest{
			Name: "Updated Test Cake",
		}
		payload, _ := json.Marshal(updatePayload)

		// Create the HTTP request with a non-existent but valid UUID
		nonExistentUUID := uuid.New().String()
		req, _ := http.NewRequest(http.MethodPut, "/api/v1/products/"+nonExistentUUID, bytes.NewBuffer(payload))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Tenant-Id", "00000000-0000-0000-0000-000000000001")

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		// Assertions
		if w.Code != http.StatusNotFound {
			t.Errorf("Expected status code %d, but got %d", http.StatusNotFound, w.Code)
			t.Logf("Response body: %s", w.Body.String())
		}
	})
}

func TestDeleteProductHandler(t *testing.T) {
	// 1. Setup
	setupTestDB(t)
	defer database.DB.Close()
	router := setupTestRouter()

	// 2. Test Case: Successful deletion
	t.Run("Successful Product Deletion", func(t *testing.T) {
		// Create a product to delete
		createdProduct := createTestProduct(t, router)

		// Create the HTTP request
		req, _ := http.NewRequest(http.MethodDelete, "/api/v1/products/"+createdProduct.ID, nil)
		req.Header.Set("X-Tenant-Id", "00000000-0000-0000-0000-000000000001")

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		// Assertions
		if w.Code != http.StatusOK {
			t.Errorf("Expected status code %d, but got %d", http.StatusOK, w.Code)
			t.Logf("Response body: %s", w.Body.String())
		}

		// Verify the product is marked as inactive in the database
		var status string
		err := database.DB.QueryRow("SELECT status FROM products WHERE id = $1", createdProduct.ID).Scan(&status)
		if err != nil {
			t.Fatalf("Failed to query product status: %v", err)
		}
		if status != "inactive" {
			t.Errorf("Expected product status to be 'inactive', but got '%s'", status)
		}
	})

	// 3. Test Case: Product not found
	t.Run("Product Not Found on Deletion", func(t *testing.T) {
		// Create the HTTP request with a non-existent but valid UUID
		nonExistentUUID := uuid.New().String()
		req, _ := http.NewRequest(http.MethodDelete, "/api/v1/products/"+nonExistentUUID, nil)
		req.Header.Set("X-Tenant-Id", "00000000-0000-0000-0000-000000000001")

		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)

		// Assertions
		if w.Code != http.StatusNotFound {
			t.Errorf("Expected status code %d, but got %d", http.StatusNotFound, w.Code)
			t.Logf("Response body: %s", w.Body.String())
		}
	})
}
