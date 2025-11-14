package main

import (
	"log"

	"github.com/gin-gonic/gin"
	"github.com/whatsapp-crm/message-sender-service/internal/config"
	"github.com/whatsapp-crm/message-sender-service/internal/handlers"
	"github.com/whatsapp-crm/message-sender-service/internal/services"
	"github.com/zsais/go-gin-prometheus"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Set Gin mode based on environment
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	// Initialize services
	messageService := services.NewMessageService(cfg)

	// Initialize handlers
	healthHandler := handlers.NewHealthHandler(cfg)
	messageHandler := handlers.NewMessageHandler(messageService)
	webhookHandler := handlers.NewWebhookHandler(cfg)

	// Setup router
	router := gin.Default()

	// Prometheus middleware
	p := ginprometheus.NewPrometheus("gin")
	p.Use(router)

	// Health and root endpoints
	router.GET("/", healthHandler.RootHandler)
	router.GET("/health", healthHandler.HealthCheck)

	// API v1 routes
	v1 := router.Group("/api/v1")
	{
		// Message endpoints
		messages := v1.Group("/messages")
		{
			messages.POST("/send", messageHandler.SendMessage)
			messages.GET("/:messageId/status", messageHandler.GetMessageStatus)
		}

		// WhatsApp Webhook endpoints
		webhook := v1.Group("/webhook")
		{
			webhook.GET("/whatsapp", webhookHandler.VerifyWebhook)
			webhook.POST("/whatsapp", webhookHandler.ReceiveWebhook)
		}
	}

	// Start server
	log.Printf("\n🚀 Message Sender Service started\n")
	log.Printf("📡 HTTP Server: http://localhost:%s\n", cfg.Port)
	log.Printf("📊 Environment: %s\n", cfg.Environment)
	log.Printf("🔄 Max Retries: %d\n", cfg.MaxRetries)
	log.Printf("⏱️  Initial Backoff: %ds\n", cfg.InitialBackoffSeconds)
	log.Printf("⏱️  Max Backoff: %ds\n\n", cfg.MaxBackoffSeconds)

	if err := router.Run(":" + cfg.Port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
