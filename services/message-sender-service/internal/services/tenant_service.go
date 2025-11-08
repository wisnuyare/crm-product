package services

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/whatsapp-crm/message-sender-service/internal/config"
	"github.com/whatsapp-crm/message-sender-service/internal/models"
)

// TenantService handles communication with Tenant Service
type TenantService struct {
	config  *config.Config
	client  *http.Client
	baseURL string
}

// NewTenantService creates a new tenant service client
func NewTenantService(cfg *config.Config) *TenantService {
	return &TenantService{
		config:  cfg,
		baseURL: cfg.TenantServiceURL,
		client: &http.Client{
			Timeout: time.Duration(cfg.RequestTimeoutSeconds) * time.Second,
		},
	}
}

// OutletResponse represents outlet data from Tenant Service
type OutletResponse struct {
	ID                     string `json:"id"`
	TenantID               string `json:"tenant_id"`
	Name                   string `json:"name"`
	WABAPhoneNumber        string `json:"waba_phone_number"`
	WABAPhoneNumberID      string `json:"waba_phone_number_id"`
	WABABusinessAccountID  string `json:"waba_business_account_id"`
	WABAAccessToken        string `json:"waba_access_token"`
	Status                 string `json:"status"`
}

// GetOutletWABAConfig fetches WABA configuration for an outlet
func (s *TenantService) GetOutletWABAConfig(tenantID, outletID string) (*models.WABAConfig, error) {
	url := fmt.Sprintf("%s/api/v1/outlets/%s", s.baseURL, outletID)

	// Create request
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("X-Tenant-Id", tenantID)
	req.Header.Set("Content-Type", "application/json")

	// Send request
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch outlet config: %w", err)
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Check status
	if resp.StatusCode != http.StatusOK {
		log.Printf("Tenant Service error: Status=%d, Body=%s", resp.StatusCode, string(body))
		return nil, fmt.Errorf("tenant service error: status=%d", resp.StatusCode)
	}

	// Parse response
	var outlet OutletResponse
	if err := json.Unmarshal(body, &outlet); err != nil {
		return nil, fmt.Errorf("failed to parse outlet response: %w", err)
	}

	// Build WABA config
	wabaConfig := &models.WABAConfig{
		PhoneNumberID: outlet.WABAPhoneNumberID,
		AccessToken:   outlet.WABAAccessToken,
	}

	log.Printf("Fetched WABA config for outlet %s: PhoneNumberID=%s", outletID, wabaConfig.PhoneNumberID)
	return wabaConfig, nil
}

// CheckQuota checks if tenant can send messages (quota check)
func (s *TenantService) CheckQuota(tenantID string) (bool, error) {
	url := fmt.Sprintf("%s/api/v1/tenants/%s/quota/check", s.baseURL, tenantID)

	// Create request
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return false, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("X-Tenant-Id", tenantID)
	req.Header.Set("Content-Type", "application/json")

	// Send request
	resp, err := s.client.Do(req)
	if err != nil {
		log.Printf("Warning: Failed to check quota for tenant %s: %v", tenantID, err)
		// Allow message if quota check fails (graceful degradation)
		return true, nil
	}
	defer resp.Body.Close()

	// Read response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("Warning: Failed to read quota response: %v", err)
		return true, nil
	}

	// Check status
	if resp.StatusCode != http.StatusOK {
		log.Printf("Quota check failed: Status=%d, Body=%s", resp.StatusCode, string(body))
		return false, fmt.Errorf("quota exceeded or service error")
	}

	// Parse response
	var quotaResp struct {
		CanSendMessage bool   `json:"can_send_message"`
		Reason         string `json:"reason"`
	}
	if err := json.Unmarshal(body, &quotaResp); err != nil {
		log.Printf("Warning: Failed to parse quota response: %v", err)
		return true, nil
	}

	if !quotaResp.CanSendMessage {
		log.Printf("Quota exceeded for tenant %s: %s", tenantID, quotaResp.Reason)
	}

	return quotaResp.CanSendMessage, nil
}
