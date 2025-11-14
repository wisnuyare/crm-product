package handlers

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/whatsapp-crm/message-sender-service/internal/config"
	"github.com/whatsapp-crm/message-sender-service/internal/models"
	"github.com/whatsapp-crm/message-sender-service/internal/services"
)

// WebhookHandler handles WhatsApp webhook requests
type WebhookHandler struct {
	config              *config.Config
	tenantService       *services.TenantService
	conversationService *services.ConversationService
	llmService          *services.LLMService
	whatsappService     *services.WhatsAppService
}

// NewWebhookHandler creates a new webhook handler
func NewWebhookHandler(cfg *config.Config) *WebhookHandler {
	return &WebhookHandler{
		config:              cfg,
		tenantService:       services.NewTenantService(cfg),
		conversationService: services.NewConversationService(cfg),
		llmService:          services.NewLLMService(cfg),
		whatsappService:     services.NewWhatsAppService(cfg),
	}
}

// VerifyWebhook handles webhook verification from Facebook
// GET /webhook/whatsapp?hub.mode=subscribe&hub.challenge=1234&hub.verify_token=your-token
func (h *WebhookHandler) VerifyWebhook(c *gin.Context) {
	mode := c.Query("hub.mode")
	challenge := c.Query("hub.challenge")
	verifyToken := c.Query("hub.verify_token")

	log.Printf("📞 Webhook verification request: mode=%s, token=%s", mode, verifyToken)

	// Verify the mode and token
	if mode == "subscribe" && verifyToken == h.config.WebhookVerifyToken {
		log.Printf("✅ Webhook verified successfully")
		// Respond with the challenge to complete verification
		c.String(http.StatusOK, challenge)
		return
	}

	log.Printf("❌ Webhook verification failed: invalid token or mode")
	c.JSON(http.StatusForbidden, gin.H{
		"error": "Verification failed",
	})
}

// ReceiveWebhook handles incoming WhatsApp messages
// POST /webhook/whatsapp
func (h *WebhookHandler) ReceiveWebhook(c *gin.Context) {
	// Verify signature (optional but recommended)
	if h.config.WebhookAppSecret != "" {
		if !h.verifySignature(c) {
			log.Printf("❌ Invalid webhook signature")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid signature"})
			return
		}
	}

	// Parse webhook payload
	var payload models.WhatsAppWebhookPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		log.Printf("❌ Failed to parse webhook payload: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}

	log.Printf("📨 Received webhook: %d entries", len(payload.Entry))

	// Process each entry
	for _, entry := range payload.Entry {
		for _, change := range entry.Changes {
			if change.Value.MessagingProduct != "whatsapp" {
				continue
			}

			// Process messages
			for _, message := range change.Value.Messages {
				h.processIncomingMessage(entry.ID, change.Value, message)
			}

			// Process status updates
			for _, status := range change.Value.Statuses {
				h.processStatusUpdate(status)
			}
		}
	}

	// Always return 200 OK to acknowledge receipt
	c.JSON(http.StatusOK, gin.H{"status": "received"})
}

// processIncomingMessage handles incoming WhatsApp messages
func (h *WebhookHandler) processIncomingMessage(
	entryID string,
	value models.WebhookValue,
	message models.WebhookMessage,
) {
	log.Printf("\n📩 === INCOMING MESSAGE ===")
	log.Printf("From: %s", message.From)
	log.Printf("Message ID: %s", message.ID)
	log.Printf("Type: %s", message.Type)
	log.Printf("Timestamp: %s", message.Timestamp)

	// Extract message content based on type
	var messageContent string
	switch message.Type {
	case "text":
		if message.Text != nil {
			messageContent = message.Text.Body
			log.Printf("Text: %s", messageContent)
		}
	case "image":
		if message.Image != nil {
			messageContent = "[Image]"
			if message.Image.Caption != "" {
				messageContent += " " + message.Image.Caption
			}
			log.Printf("Image ID: %s, Caption: %s", message.Image.ID, message.Image.Caption)
		}
	case "audio":
		messageContent = "[Audio]"
		log.Printf("Audio ID: %s", message.Audio.ID)
	case "video":
		messageContent = "[Video]"
		if message.Video != nil && message.Video.Caption != "" {
			messageContent += " " + message.Video.Caption
		}
		log.Printf("Video ID: %s", message.Video.ID)
	case "document":
		messageContent = "[Document]"
		if message.Document != nil {
			messageContent += " " + message.Document.Filename
		}
		log.Printf("Document ID: %s", message.Document.ID)
	case "button":
		if message.Button != nil {
			messageContent = message.Button.Text
			log.Printf("Button: %s (payload: %s)", message.Button.Text, message.Button.Payload)
		}
	case "interactive":
		// Handle interactive button/list replies
		messageContent = "[Interactive Response]"
		log.Printf("Interactive type: %v", message.Interactive)
	default:
		log.Printf("⚠️  Unsupported message type: %s", message.Type)
		messageContent = fmt.Sprintf("[Unsupported: %s]", message.Type)
	}

	log.Printf("========================\n")

	// Process the message: find outlet, create conversation, call LLM, send response
	if err := h.handleMessage(value.Metadata.PhoneNumberID, message.From, messageContent, message.ID); err != nil {
		log.Printf("❌ Error processing message: %v", err)
	}
}

// handleMessage orchestrates the complete message processing flow
func (h *WebhookHandler) handleMessage(phoneNumberID, customerPhone, messageContent, whatsappMessageID string) error {
	log.Printf("\n🔄 Processing message from %s...", customerPhone)

	// Step 1: Find which outlet/tenant owns this phone number
	log.Printf("📍 Step 1: Looking up outlet for phone number ID %s", phoneNumberID)
	outlet, err := h.tenantService.GetOutletByPhoneNumberID(phoneNumberID)
	if err != nil {
		return fmt.Errorf("failed to find outlet: %w", err)
	}
	log.Printf("✅ Found outlet: %s (tenant: %s)", outlet.ID, outlet.TenantID)

	// Step 2: Find or create conversation
	log.Printf("📍 Step 2: Finding or creating conversation...")
	conversation, err := h.conversationService.FindOrCreateConversation(
		outlet.TenantID,
		outlet.ID,
		customerPhone,
	)
	if err != nil {
		return fmt.Errorf("failed to find/create conversation: %w", err)
	}
	log.Printf("✅ Conversation ID: %s", conversation.ID)

	// Step 3: Store customer message
	log.Printf("📍 Step 3: Storing customer message...")
	if err := h.conversationService.StoreMessage(
		outlet.TenantID,
		conversation.ID,
		"customer",
		messageContent,
		whatsappMessageID,
	); err != nil {
		return fmt.Errorf("failed to store message: %w", err)
	}
	log.Printf("✅ Message stored")

	// Step 4: Get knowledge base IDs for this outlet
	log.Printf("📍 Step 4: Fetching knowledge bases...")
	kbIDs, err := h.tenantService.GetKnowledgeBaseIDs(outlet.TenantID, outlet.ID)
	if err != nil {
		log.Printf("⚠️  Warning: Failed to fetch KB IDs: %v (continuing without RAG)", err)
		kbIDs = []string{} // Continue without RAG if KB fetch fails
	}
	log.Printf("✅ Found %d knowledge bases", len(kbIDs))

	// Step 5: Generate LLM response
	log.Printf("📍 Step 5: Generating LLM response...")
	llmResponse, err := h.llmService.GenerateResponse(
		outlet.TenantID,
		conversation.ID,
		messageContent,
		kbIDs,
	)
	if err != nil {
		return fmt.Errorf("failed to generate LLM response: %w", err)
	}
	log.Printf("✅ LLM response generated (%d chars)", len(llmResponse.Response))

	// Step 6: Send response back via WhatsApp
	log.Printf("📍 Step 6: Sending response to customer...")
	wabaConfig := &models.WABAConfig{
		PhoneNumberID: phoneNumberID,
		AccessToken:   outlet.WABAAccessToken,
	}

	_, err = h.whatsappService.SendMessageWithRetry(
		wabaConfig,
		customerPhone,
		llmResponse.Response,
		"text",
	)
	if err != nil {
		return fmt.Errorf("failed to send WhatsApp message: %w", err)
	}
	log.Printf("✅ Response sent to customer")

	log.Printf("🎉 Message processing complete!\n")
	return nil
}

// processStatusUpdate handles message status updates (sent, delivered, read)
func (h *WebhookHandler) processStatusUpdate(status models.WebhookStatus) {
	log.Printf("📊 Message status update: ID=%s, Status=%s, Timestamp=%s",
		status.ID, status.Status, status.Timestamp)

	// TODO: Update message delivery status in database
}

// verifySignature validates the X-Hub-Signature-256 header
func (h *WebhookHandler) verifySignature(c *gin.Context) bool {
	signature := c.GetHeader("X-Hub-Signature-256")
	if signature == "" {
		return false
	}

	// Read body
	bodyBytes, err := io.ReadAll(c.Request.Body)
	if err != nil {
		return false
	}

	// Restore body for later processing
	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

	// Compute expected signature
	mac := hmac.New(sha256.New, []byte(h.config.WebhookAppSecret))
	mac.Write(bodyBytes)
	expectedSignature := "sha256=" + hex.EncodeToString(mac.Sum(nil))

	// Compare signatures
	return hmac.Equal([]byte(signature), []byte(expectedSignature))
}
