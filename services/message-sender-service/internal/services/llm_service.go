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

// GenerateRequest represents LLM generation request
type GenerateRequest struct {
	ConversationID   string   `json:"conversation_id"`
	UserMessage      string   `json:"user_message"`
	KnowledgeBaseIDs []string `json:"knowledge_base_ids,omitempty"`
}

// GenerateResponse represents LLM generation response
type GenerateResponse struct {
	Response        string                 `json:"response"`
	ConversationID  string                 `json:"conversation_id"`
	TokensUsed      map[string]int         `json:"tokens_used"`
	Cost            map[string]float64     `json:"cost"`
	RAGContextUsed  bool                   `json:"rag_context_used"`
	RAGSources      []string               `json:"rag_sources"`
	Model           string                 `json:"model"`
	FunctionsExecuted []map[string]interface{} `json:"functions_executed"`
}

// GenerateResponse calls LLM Orchestration Service to generate a response
func (s *LLMService) GenerateResponse(tenantID, conversationID, userMessage string, knowledgeBaseIDs []string) (*GenerateResponse, error) {
	url := fmt.Sprintf("%s/api/v1/llm/generate", s.config.LLMOrchestrationURL)

	reqBody := GenerateRequest{
		ConversationID:   conversationID,
		UserMessage:      userMessage,
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

	log.Printf("✅ LLM generated response: %d chars, RAG used: %v, cost: $%.6f",
		len(llmResp.Response), llmResp.RAGContextUsed, llmResp.Cost["total"])

	return &llmResp, nil
}
