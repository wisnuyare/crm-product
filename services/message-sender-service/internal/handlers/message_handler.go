package handlers

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/whatsapp-crm/message-sender-service/internal/models"
	"github.com/whatsapp-crm/message-sender-service/internal/services"
)

// MessageHandler handles HTTP requests for messages
type MessageHandler struct {
	messageService *services.MessageService
}

// NewMessageHandler creates a new message handler
func NewMessageHandler(messageService *services.MessageService) *MessageHandler {
	return &MessageHandler{
		messageService: messageService,
	}
}

// SendMessage handles POST /api/v1/messages/send
func (h *MessageHandler) SendMessage(c *gin.Context) {
	var req models.SendMessageRequest

	// Bind JSON request
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("Invalid request: %v", err)
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "invalid_request",
			Message: err.Error(),
		})
		return
	}

	// Send message
	response, err := h.messageService.SendMessage(&req)
	if err != nil {
		log.Printf("Failed to send message: %v", err)

		// Check if it's a quota error
		if err.Error() == "message quota exceeded for tenant" {
			c.JSON(http.StatusTooManyRequests, models.ErrorResponse{
				Error:   "quota_exceeded",
				Message: "Message quota exceeded. Please upgrade your plan or wait for quota reset.",
				Code:    "QUOTA_EXCEEDED",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "send_failed",
			Message: "Failed to send message",
		})
		return
	}

	c.JSON(http.StatusOK, response)
}

// GetMessageStatus handles GET /api/v1/messages/:messageId/status
func (h *MessageHandler) GetMessageStatus(c *gin.Context) {
	messageID := c.Param("messageId")

	if messageID == "" {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "invalid_request",
			Message: "Message ID is required",
		})
		return
	}

	status, err := h.messageService.GetMessageStatus(messageID)
	if err != nil {
		log.Printf("Failed to get message status: %v", err)
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "status_fetch_failed",
			Message: "Failed to retrieve message status",
		})
		return
	}

	c.JSON(http.StatusOK, status)
}
