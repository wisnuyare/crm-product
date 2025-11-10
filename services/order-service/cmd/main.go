package main

import (
	"log"
	"net/http"
	"order-service/internal/database"
	"order-service/internal/handlers"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/zsais/go-gin-prometheus"
)

func main() {
	// Connect to database
	if err := database.Connect(); err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer database.Close()

	// Initialize Gin router
	router := gin.Default()

	// Prometheus middleware
	p := ginprometheus.NewPrometheus("gin")
	p.Use(router)

	// CORS middleware
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Tenant-Id"},
		AllowCredentials: true,
	}))

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": "order-service",
		})
	})

	// API v1 routes
	v1 := router.Group("/api/v1")
	{
		// Product routes
		products := v1.Group("/products")
		{
			products.POST("", handlers.CreateProduct)
			products.GET("", handlers.GetProducts)
			products.GET("/low-stock", handlers.GetLowStockProducts)
			products.GET("/:id", handlers.GetProduct)
			products.PUT("/:id", handlers.UpdateProduct)
			products.DELETE("/:id", handlers.DeleteProduct)
			products.PUT("/:id/stock", handlers.AdjustStock)
		}

		// Order routes
		orders := v1.Group("/orders")
		{
			orders.POST("", handlers.CreateOrder)
			orders.GET("", handlers.GetOrders)
			orders.GET("/:id", handlers.GetOrder)
			orders.PUT("/:id/status", handlers.UpdateOrderStatus)
			orders.PUT("/:id/payment", handlers.UpdatePaymentStatus)
			orders.DELETE("/:id", handlers.CancelOrder)
		}

		// Categories routes (basic)
		categories := v1.Group("/categories")
		{
			categories.GET("", func(c *gin.Context) {
				tenantID := c.GetHeader("X-Tenant-Id")
				if tenantID == "" {
					c.JSON(http.StatusBadRequest, gin.H{"error": "X-Tenant-Id header is required"})
					return
				}

				rows, err := database.DB.Query(`
					SELECT id, tenant_id, name, description, display_order, created_at
					FROM categories
					WHERE tenant_id = $1
					ORDER BY display_order ASC, name ASC
				`, tenantID)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch categories"})
					return
				}
				defer rows.Close()

				var categories []map[string]interface{}
				for rows.Next() {
					var id, tenantID, name string
					var description *string
					var displayOrder int
					var createdAt string

					rows.Scan(&id, &tenantID, &name, &description, &displayOrder, &createdAt)

					category := map[string]interface{}{
						"id":            id,
						"tenant_id":     tenantID,
						"name":          name,
						"display_order": displayOrder,
						"created_at":    createdAt,
					}
					if description != nil {
						category["description"] = *description
					}
					categories = append(categories, category)
				}

				c.JSON(http.StatusOK, gin.H{
					"categories": categories,
					"total":      len(categories),
				})
			})
		}
	}

	// Get port from environment or default to 3009
	port := os.Getenv("PORT")
	if port == "" {
		port = "3009"
	}

	log.Printf("🚀 Order Service starting on port %s", port)
	log.Printf("📦 Product endpoints: /api/v1/products")
	log.Printf("🛒 Order endpoints: /api/v1/orders")
	log.Printf("📊 Categories endpoints: /api/v1/categories")

	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
