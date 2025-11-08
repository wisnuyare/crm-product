package models

import "time"

// SendMessageRequest represents a request to send a message
type SendMessageRequest struct {
	TenantID       string `json:"tenant_id" binding:"required"`
	OutletID       string `json:"outlet_id" binding:"required"`
	ConversationID string `json:"conversation_id" binding:"required"`
	To             string `json:"to" binding:"required"`
	Message        string `json:"message" binding:"required"`
	MessageType    string `json:"message_type"` // text, image, document, etc.
}

// SendMessageResponse represents the response after sending a message
type SendMessageResponse struct {
	MessageID       string    `json:"message_id"`
	WhatsAppMsgID   string    `json:"whatsapp_message_id"`
	Status          string    `json:"status"` // queued, sent, delivered, failed
	SentAt          time.Time `json:"sent_at"`
	ConversationID  string    `json:"conversation_id"`
}

// MessageStatusResponse represents the status of a message
type MessageStatusResponse struct {
	MessageID       string    `json:"message_id"`
	WhatsAppMsgID   string    `json:"whatsapp_message_id"`
	Status          string    `json:"status"`
	DeliveredAt     *time.Time `json:"delivered_at,omitempty"`
	ReadAt          *time.Time `json:"read_at,omitempty"`
	FailureReason   string    `json:"failure_reason,omitempty"`
}

// WhatsAppMessage represents a message in WhatsApp Cloud API format
type WhatsAppMessage struct {
	MessagingProduct string      `json:"messaging_product"`
	RecipientType    string      `json:"recipient_type"`
	To               string      `json:"to"`
	Type             string      `json:"type"`
	Text             *TextObject `json:"text,omitempty"`
}

// TextObject represents text content for WhatsApp
type TextObject struct {
	Body string `json:"body"`
}

// WhatsAppResponse represents WhatsApp API response
type WhatsAppResponse struct {
	MessagingProduct string    `json:"messaging_product"`
	Contacts         []Contact `json:"contacts"`
	Messages         []Message `json:"messages"`
}

// Contact represents contact info in WhatsApp response
type Contact struct {
	Input string `json:"input"`
	WaID  string `json:"wa_id"`
}

// Message represents message info in WhatsApp response
type Message struct {
	ID string `json:"id"`
}

// WABAConfig represents WhatsApp Business Account configuration
type WABAConfig struct {
	PhoneNumberID string `json:"phone_number_id"`
	AccessToken   string `json:"access_token"`
}

// ErrorResponse represents an error response
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
	Code    string `json:"code,omitempty"`
}

// HealthResponse represents health check response
type HealthResponse struct {
	Status      string `json:"status"`
	Service     string `json:"service"`
	Version     string `json:"version"`
	Environment string `json:"environment"`
}
