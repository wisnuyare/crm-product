package services

import (
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/whatsapp-crm/message-sender-service/internal/config"
	"github.com/whatsapp-crm/message-sender-service/internal/models"
)

// MessageService orchestrates message sending
type MessageService struct {
	config              *config.Config
	whatsappService     *WhatsAppService
	tenantService       *TenantService
	conversationService *ConversationService
}

// NewMessageService creates a new message service
func NewMessageService(cfg *config.Config) *MessageService {
	return &MessageService{
		config:              cfg,
		whatsappService:     NewWhatsAppService(cfg),
		tenantService:       NewTenantService(cfg),
		conversationService: NewConversationService(cfg),
	}
}

// SendMessage orchestrates the complete message sending flow
func (s *MessageService) SendMessage(req *models.SendMessageRequest) (*models.SendMessageResponse, error) {
	log.Printf("Processing message send request: ConversationID=%s, To=%s", req.ConversationID, req.To)

	// Step 1: Check quota
	canSend, err := s.tenantService.CheckQuota(req.TenantID)
	if err != nil {
		log.Printf("Quota check failed: %v", err)
		return nil, fmt.Errorf("quota check failed: %w", err)
	}
	if !canSend {
		log.Printf("Quota exceeded for tenant %s", req.TenantID)
		return nil, fmt.Errorf("message quota exceeded for tenant")
	}

	// Step 2: Fetch WABA configuration
	wabaConfig, err := s.tenantService.GetOutletWABAConfig(req.TenantID, req.OutletID)
	if err != nil {
		log.Printf("Failed to fetch WABA config: %v", err)
		return nil, fmt.Errorf("failed to fetch WABA configuration: %w", err)
	}

	// Step 3: Send message via WhatsApp with retry
	whatsappResp, err := s.whatsappService.SendMessageWithRetry(
		wabaConfig,
		req.To,
		req.Message,
		req.MessageType,
	)
	if err != nil {
		log.Printf("Failed to send WhatsApp message: %v", err)
		return nil, fmt.Errorf("failed to send WhatsApp message: %w", err)
	}

	// Extract WhatsApp message ID
	whatsappMsgID := whatsappResp.Messages[0].ID

	// Step 4: Store message in Conversation Service
	// Use "llm" as default, can be overridden if this is an agent message
	senderType := "llm"
	err = s.conversationService.StoreMessage(
		req.TenantID,
		req.ConversationID,
		senderType,
		req.Message,
		whatsappMsgID,
	)
	if err != nil {
		log.Printf("Warning: Failed to store message in Conversation Service: %v", err)
		// Don't fail the whole operation
	}

	// Step 5: Build response
	messageID := uuid.New().String()
	response := &models.SendMessageResponse{
		MessageID:      messageID,
		WhatsAppMsgID:  whatsappMsgID,
		Status:         "sent",
		SentAt:         time.Now(),
		ConversationID: req.ConversationID,
	}

	log.Printf("Message sent successfully: MessageID=%s, WhatsAppMsgID=%s", messageID, whatsappMsgID)
	return response, nil
}

// GetMessageStatus retrieves the status of a message
// Note: This is a placeholder - real implementation would query a database
// or WhatsApp webhook data
func (s *MessageService) GetMessageStatus(messageID string) (*models.MessageStatusResponse, error) {
	// TODO: Implement actual status tracking
	// For now, return a placeholder response
	log.Printf("Status query for message: %s", messageID)

	return &models.MessageStatusResponse{
		MessageID:     messageID,
		WhatsAppMsgID: "wamid.placeholder",
		Status:        "sent",
	}, nil
}
