package main

import (
	"log"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/your-org/crm-product/billing-service/internal/database"
	"github.com/your-org/crm-product/billing-service/internal/handlers"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("⚠️  No .env file found, using environment variables")
	}

	// Connect to database
	db, err := database.Connect()
	if err != nil {
		log.Fatalf("❌ Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Set Gin mode
	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}

	// Initialize Gin router
	router := gin.Default()

	// CORS middleware
	router.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		// Test database connection
		if err := db.Ping(); err != nil {
			c.JSON(500, gin.H{
				"status": "unhealthy",
				"error":  "Database connection failed",
			})
			return
		}

		c.JSON(200, gin.H{
			"status":  "healthy",
			"service": "billing-service",
			"version": "1.0.0",
		})
	})

	// Initialize handlers
	subscriptionHandler := handlers.NewSubscriptionHandler(db)
	depositHandler := handlers.NewDepositHandler(db)
	usageHandler := handlers.NewUsageHandler(db)

	// API v1 routes
	v1 := router.Group("/api/v1/billing")
	{
		// Subscription tiers (public)
		v1.GET("/tiers", subscriptionHandler.GetTiers)

		// Tenant-specific routes
		tenants := v1.Group("/tenants/:tenantId")
		{
			// Subscription management
			tenants.GET("/subscription", subscriptionHandler.GetSubscription)
			tenants.POST("/subscription", subscriptionHandler.CreateSubscription)
			tenants.PUT("/subscription", subscriptionHandler.UpdateSubscription)
			tenants.DELETE("/subscription", subscriptionHandler.CancelSubscription)

			// Deposit management
			tenants.GET("/deposit", depositHandler.GetDeposit)
			tenants.POST("/deposit", depositHandler.AddDeposit)
			tenants.POST("/deposit/deduct", depositHandler.DeductDeposit)

			// Usage tracking
			tenants.GET("/usage", usageHandler.GetUsage)
			tenants.POST("/usage", usageHandler.RecordUsage)

			// Quota checking
			tenants.GET("/quota", usageHandler.GetQuotaStatus)
			tenants.POST("/quota/check", usageHandler.CheckQuota)
		}
	}

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "3002"
	}

	log.Printf("🚀 Billing Service starting on port %s", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("❌ Failed to start server: %v", err)
	}
}
