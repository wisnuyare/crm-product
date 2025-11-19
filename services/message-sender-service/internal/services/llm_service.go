package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"

	"github.com/whatsapp-crm/message-sender-service/internal/config"
)

// LLMService handles LLM orchestration API calls
type LLMService struct {
	config *config.Config
}

// NewLLMService creates a new LLM service client
func NewLLMService(cfg *config.Config) *LLMService {
	return &LLMService{
		config: cfg,
	}
}

// GenerateRequest represents multi-agent chat request
type GenerateRequest struct {
	ConversationID   string   `json:"conversation_id"`
	UserMessage      string   `json:"user_message"`
	OutletID         string   `json:"outlet_id,omitempty"`
	CustomerPhone    string   `json:"customer_phone,omitempty"`
	KnowledgeBaseIDs []string `json:"knowledge_base_ids,omitempty"`
}

// GenerateResponse represents multi-agent chat response
type GenerateResponse struct {
	Response           string                   `json:"response"`
	ConversationID     string                   `json:"conversation_id"`
	Intent             string                   `json:"intent"`
	AgentUsed          string                   `json:"agent_used"`
	Confidence         float64                  `json:"confidence"`
	TransactionCreated bool                     `json:"transaction_created"`
	TransactionID      string                   `json:"transaction_id,omitempty"`
	FunctionCalls      []map[string]interface{} `json:"function_calls,omitempty"`
	Metadata           map[string]interface{}   `json:"metadata,omitempty"`
	// Legacy fields (for backwards compatibility)
	TokensUsed     map[string]int     `json:"tokens_used,omitempty"`
	Cost           map[string]float64 `json:"cost,omitempty"`
	RAGContextUsed bool               `json:"rag_context_used,omitempty"`
	RAGSources     []string           `json:"rag_sources,omitempty"`
	Model          string             `json:"model,omitempty"`
}

// GenerateResponse calls LLM Orchestration Service multi-agent chat endpoint
func (s *LLMService) GenerateResponse(tenantID, conversationID, userMessage, outletID, customerPhone string, knowledgeBaseIDs []string) (*GenerateResponse, error) {
	url := fmt.Sprintf("%s/api/v1/llm/chat", s.config.LLMOrchestrationURL)

	reqBody := GenerateRequest{
		ConversationID:   conversationID,
		UserMessage:      userMessage,
		OutletID:         outletID,
		CustomerPhone:    customerPhone,
		KnowledgeBaseIDs: knowledgeBaseIDs,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Tenant-Id", tenantID)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to call LLM service: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("LLM service error: %d - %s", resp.StatusCode, string(body))
	}

	var llmResp GenerateResponse
	if err := json.Unmarshal(body, &llmResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	log.Printf("✅ Multi-agent response: %d chars, intent=%s, agent=%s, confidence=%.2f, transaction=%v",
		len(llmResp.Response), llmResp.Intent, llmResp.AgentUsed, llmResp.Confidence, llmResp.TransactionCreated)

	return &llmResp, nil
}
