package main

import (
	"booking-service/internal/database"
	"booking-service/internal/handlers"
	"fmt"
	"log"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/zsais/go-gin-prometheus"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "3008"
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL environment variable is required")
	}

	// Initialize database connection
	db, err := database.Connect(dbURL)
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer db.Close()

	log.Println("✅ Connected to PostgreSQL database")

	// Initialize Gin router
	router := gin.Default()

	// Prometheus middleware
	p := ginprometheus.NewPrometheus("gin")
	p.Use(router)

	// CORS middleware
	router.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, X-Tenant-Id")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "healthy",
			"service": "booking-service",
			"version": "0.1.0-poc",
		})
	})

	// API v1 routes
	v1 := router.Group("/api/v1")
	{
		// Resources endpoints
		v1.GET("/resources", handlers.ListResources(db))
		v1.POST("/resources", handlers.CreateResource(db))
		v1.GET("/resources/:id", handlers.GetResource(db))

		// Bookings endpoints
		v1.GET("/bookings", handlers.ListBookings(db))
		v1.POST("/bookings", handlers.CreateBooking(db))
		v1.GET("/bookings/:id", handlers.GetBooking(db))
		v1.GET("/bookings/availability/check", handlers.CheckAvailability(db))
	}

	log.Printf("🚀 Booking Service (POC) starting on port %s", port)
	if err := router.Run(fmt.Sprintf(":%s", port)); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
