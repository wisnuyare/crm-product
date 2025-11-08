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
	"github.com/whatsapp-crm/message-sender-service/internal/models"
)

// WhatsAppService handles WhatsApp Cloud API communication
type WhatsAppService struct {
	config *config.Config
	client *http.Client
}

// NewWhatsAppService creates a new WhatsApp service
func NewWhatsAppService(cfg *config.Config) *WhatsAppService {
	return &WhatsAppService{
		config: cfg,
		client: &http.Client{
			Timeout: time.Duration(cfg.RequestTimeoutSeconds) * time.Second,
		},
	}
}

// SendMessage sends a message via WhatsApp Cloud API
func (s *WhatsAppService) SendMessage(
	wabaConfig *models.WABAConfig,
	to string,
	message string,
	messageType string,
) (*models.WhatsAppResponse, error) {
	// Build WhatsApp API URL
	url := fmt.Sprintf("https://graph.facebook.com/v18.0/%s/messages", wabaConfig.PhoneNumberID)

	// Create WhatsApp message payload
	payload := models.WhatsAppMessage{
		MessagingProduct: "whatsapp",
		RecipientType:    "individual",
		To:               to,
		Type:             "text",
		Text: &models.TextObject{
			Body: message,
		},
	}

	// Marshal to JSON
	jsonData, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	// Create HTTP request
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("Authorization", "Bearer "+wabaConfig.AccessToken)
	req.Header.Set("Content-Type", "application/json")

	// Send request
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Check status code
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		log.Printf("WhatsApp API error: Status=%d, Body=%s", resp.StatusCode, string(body))
		return nil, fmt.Errorf("WhatsApp API error: status=%d, body=%s", resp.StatusCode, string(body))
	}

	// Parse response
	var whatsappResp models.WhatsAppResponse
	if err := json.Unmarshal(body, &whatsappResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	log.Printf("Message sent successfully: WhatsAppMsgID=%s, To=%s", whatsappResp.Messages[0].ID, to)
	return &whatsappResp, nil
}

// SendMessageWithRetry sends a message with retry logic
func (s *WhatsAppService) SendMessageWithRetry(
	wabaConfig *models.WABAConfig,
	to string,
	message string,
	messageType string,
) (*models.WhatsAppResponse, error) {
	var lastErr error
	backoff := time.Duration(s.config.InitialBackoffSeconds) * time.Second
	maxBackoff := time.Duration(s.config.MaxBackoffSeconds) * time.Second

	for attempt := 0; attempt <= s.config.MaxRetries; attempt++ {
		if attempt > 0 {
			log.Printf("Retry attempt %d/%d for message to %s (backoff: %v)",
				attempt, s.config.MaxRetries, to, backoff)
			time.Sleep(backoff)

			// Exponential backoff
			backoff *= 2
			if backoff > maxBackoff {
				backoff = maxBackoff
			}
		}

		resp, err := s.SendMessage(wabaConfig, to, message, messageType)
		if err == nil {
			if attempt > 0 {
				log.Printf("Message sent successfully after %d retries", attempt)
			}
			return resp, nil
		}

		lastErr = err
		log.Printf("Attempt %d failed: %v", attempt+1, err)
	}

	return nil, fmt.Errorf("failed after %d retries: %w", s.config.MaxRetries, lastErr)
}
