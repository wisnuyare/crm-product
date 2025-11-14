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

// WhatsApp Webhook Models

// WhatsAppWebhookPayload represents the webhook payload from WhatsApp
type WhatsAppWebhookPayload struct {
	Object string         `json:"object"`
	Entry  []WebhookEntry `json:"entry"`
}

// WebhookEntry represents an entry in the webhook payload
type WebhookEntry struct {
	ID      string          `json:"id"`
	Changes []WebhookChange `json:"changes"`
}

// WebhookChange represents a change notification
type WebhookChange struct {
	Value WebhookValue `json:"value"`
	Field string       `json:"field"`
}

// WebhookValue contains the actual webhook data
type WebhookValue struct {
	MessagingProduct string            `json:"messaging_product"`
	Metadata         WebhookMetadata   `json:"metadata"`
	Contacts         []WebhookContact  `json:"contacts,omitempty"`
	Messages         []WebhookMessage  `json:"messages,omitempty"`
	Statuses         []WebhookStatus   `json:"statuses,omitempty"`
}

// WebhookMetadata contains phone number info
type WebhookMetadata struct {
	DisplayPhoneNumber string `json:"display_phone_number"`
	PhoneNumberID      string `json:"phone_number_id"`
}

// WebhookContact represents contact information
type WebhookContact struct {
	Profile WebhookProfile `json:"profile"`
	WaID    string         `json:"wa_id"`
}

// WebhookProfile represents user profile
type WebhookProfile struct {
	Name string `json:"name"`
}

// WebhookMessage represents an incoming message
type WebhookMessage struct {
	From        string                  `json:"from"`
	ID          string                  `json:"id"`
	Timestamp   string                  `json:"timestamp"`
	Type        string                  `json:"type"`
	Text        *WebhookText            `json:"text,omitempty"`
	Image       *WebhookMedia           `json:"image,omitempty"`
	Audio       *WebhookMedia           `json:"audio,omitempty"`
	Video       *WebhookMedia           `json:"video,omitempty"`
	Document    *WebhookDocument        `json:"document,omitempty"`
	Button      *WebhookButton          `json:"button,omitempty"`
	Interactive *WebhookInteractive     `json:"interactive,omitempty"`
	Context     *WebhookContext         `json:"context,omitempty"`
}

// WebhookText represents text message content
type WebhookText struct {
	Body string `json:"body"`
}

// WebhookMedia represents media message (image, audio, video)
type WebhookMedia struct {
	Caption  string `json:"caption,omitempty"`
	MimeType string `json:"mime_type"`
	SHA256   string `json:"sha256"`
	ID       string `json:"id"`
}

// WebhookDocument represents document message
type WebhookDocument struct {
	Caption  string `json:"caption,omitempty"`
	Filename string `json:"filename"`
	MimeType string `json:"mime_type"`
	SHA256   string `json:"sha256"`
	ID       string `json:"id"`
}

// WebhookButton represents button response
type WebhookButton struct {
	Payload string `json:"payload"`
	Text    string `json:"text"`
}

// WebhookInteractive represents interactive message response
type WebhookInteractive struct {
	Type        string                      `json:"type"`
	ButtonReply *WebhookButtonReply         `json:"button_reply,omitempty"`
	ListReply   *WebhookListReply           `json:"list_reply,omitempty"`
}

// WebhookButtonReply represents button reply
type WebhookButtonReply struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

// WebhookListReply represents list reply
type WebhookListReply struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description,omitempty"`
}

// WebhookContext represents message context (reply info)
type WebhookContext struct {
	From string `json:"from"`
	ID   string `json:"id"`
}

// WebhookStatus represents message status update
type WebhookStatus struct {
	ID           string                 `json:"id"`
	Status       string                 `json:"status"`
	Timestamp    string                 `json:"timestamp"`
	RecipientID  string                 `json:"recipient_id"`
	Conversation *WebhookConversation   `json:"conversation,omitempty"`
	Pricing      *WebhookPricing        `json:"pricing,omitempty"`
}

// WebhookConversation represents conversation info
type WebhookConversation struct {
	ID     string                 `json:"id"`
	Origin *WebhookOrigin         `json:"origin,omitempty"`
}

// WebhookOrigin represents conversation origin
type WebhookOrigin struct {
	Type string `json:"type"`
}

// WebhookPricing represents message pricing info
type WebhookPricing struct {
	Billable     bool   `json:"billable"`
	PricingModel string `json:"pricing_model"`
	Category     string `json:"category"`
}
