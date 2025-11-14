package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/whatsapp-crm/message-sender-service/internal/config"
)

// ConversationService handles communication with Conversation Service
type ConversationService struct {
	config  *config.Config
	client  *http.Client
	baseURL string
}

// NewConversationService creates a new conversation service client
func NewConversationService(cfg *config.Config) *ConversationService {
	return &ConversationService{
		config:  cfg,
		baseURL: cfg.ConversationServiceURL,
		client: &http.Client{
			Timeout: time.Duration(cfg.RequestTimeoutSeconds) * time.Second,
		},
	}
}

// StoreMessageRequest represents request to store a message
type StoreMessageRequest struct {
	ConversationID    string                 `json:"conversation_id"`
	SenderType        string                 `json:"sender_type"` // "llm" or "agent"
	SenderID          string                 `json:"sender_id,omitempty"`
	Content           string                 `json:"content"`
	WhatsAppMessageID string                 `json:"whatsapp_message_id"`
	Metadata          map[string]interface{} `json:"metadata,omitempty"`
}

// ConversationResponse represents a conversation from Conversation Service
type ConversationResponse struct {
	ID           string `json:"id"`
	TenantID     string `json:"tenant_id"`
	OutletID     string `json:"outlet_id"`
	CustomerPhone string `json:"customer_phone"`
	Status       string `json:"status"`
}

// FindOrCreateConversation finds existing or creates new conversation
func (s *ConversationService) FindOrCreateConversation(
	tenantID string,
	outletID string,
	customerPhone string,
) (*ConversationResponse, error) {
	url := fmt.Sprintf("%s/api/v1/conversations/find-or-create", s.baseURL)

	// Create payload
	payload := map[string]string{
		"outlet_id":      outletID,
		"customer_phone": customerPhone,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	// Create request
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("X-Tenant-Id", tenantID)
	req.Header.Set("Content-Type", "application/json")

	// Send request
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to call Conversation Service: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Check status
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("Conversation Service error: %d - %s", resp.StatusCode, string(body))
	}

	// Parse response
	var conversation ConversationResponse
	if err := json.Unmarshal(body, &conversation); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	log.Printf("Found/created conversation: ID=%s, Customer=%s", conversation.ID, customerPhone)
	return &conversation, nil
}

// StoreMessage stores a sent message in the Conversation Service
func (s *ConversationService) StoreMessage(
	tenantID string,
	conversationID string,
	senderType string,
	content string,
	whatsappMsgID string,
) error {
	url := fmt.Sprintf("%s/api/v1/messages", s.baseURL)

	// Create payload
	payload := StoreMessageRequest{
		ConversationID:    conversationID,
		SenderType:        senderType,
		Content:           content,
		WhatsAppMessageID: whatsappMsgID,
		Metadata: map[string]interface{}{
			"sent_at": time.Now().Format(time.RFC3339),
		},
	}

	// Marshal to JSON
	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	// Create request
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("X-Tenant-Id", tenantID)
	req.Header.Set("Content-Type", "application/json")

	// Send request
	resp, err := s.client.Do(req)
	if err != nil {
		log.Printf("Warning: Failed to store message in Conversation Service: %v", err)
		// Don't fail the whole operation if storing fails
		return nil
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("Warning: Failed to read response: %v", err)
		return nil
	}

	// Check status
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		log.Printf("Warning: Conversation Service error: Status=%d, Body=%s", resp.StatusCode, string(body))
		return nil
	}

	log.Printf("Message stored in Conversation Service: ConversationID=%s, WhatsAppMsgID=%s",
		conversationID, whatsappMsgID)
	return nil
}
