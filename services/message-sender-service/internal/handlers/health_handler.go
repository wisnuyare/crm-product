package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/whatsapp-crm/message-sender-service/internal/config"
	"github.com/whatsapp-crm/message-sender-service/internal/models"
)

// HealthHandler handles health check requests
type HealthHandler struct {
	config *config.Config
}

// NewHealthHandler creates a new health handler
func NewHealthHandler(cfg *config.Config) *HealthHandler {
	return &HealthHandler{
		config: cfg,
	}
}

// HealthCheck handles GET /health
func (h *HealthHandler) HealthCheck(c *gin.Context) {
	response := models.HealthResponse{
		Status:      "healthy",
		Service:     "message-sender-service",
		Version:     "1.0.0",
		Environment: h.config.Environment,
	}

	c.JSON(http.StatusOK, response)
}

// RootHandler handles GET /
func (h *HealthHandler) RootHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"service": "message-sender-service",
		"version": "1.0.0",
		"status":  "running",
		"endpoints": gin.H{
			"health":      "/health",
			"send":        "/api/v1/messages/send",
			"status":      "/api/v1/messages/:messageId/status",
		},
	})
}
