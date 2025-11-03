package handlers

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/your-org/crm-product/billing-service/internal/database"
	"github.com/your-org/crm-product/billing-service/pkg/types"
)

type SubscriptionHandler struct {
	db *database.DB
}

func NewSubscriptionHandler(db *database.DB) *SubscriptionHandler {
	return &SubscriptionHandler{db: db}
}

// GetTiers returns all available subscription tiers
// GET /api/v1/billing/tiers
func (h *SubscriptionHandler) GetTiers(c *gin.Context) {
	tiers := []types.SubscriptionTier{
		types.SubscriptionTiers[types.TierStarter],
		types.SubscriptionTiers[types.TierGrowth],
		types.SubscriptionTiers[types.TierEnterprise],
	}

	c.JSON(http.StatusOK, tiers)
}

// GetSubscription returns the active subscription for a tenant
// GET /api/v1/billing/tenants/:tenantId/subscription
func (h *SubscriptionHandler) GetSubscription(c *gin.Context) {
	tenantID := c.Param("tenantId")

	var subscription types.Subscription
	query := `
		SELECT id, tenant_id, tier, status, message_quota, outlet_limit,
		       knowledge_base_limit, storage_limit_mb, monthly_price, overage_rate,
		       started_at, ended_at, created_at
		FROM subscriptions
		WHERE tenant_id = $1 AND status = $2
		ORDER BY created_at DESC
		LIMIT 1
	`

	err := h.db.QueryRow(query, tenantID, types.StatusActive).Scan(
		&subscription.ID,
		&subscription.TenantID,
		&subscription.Tier,
		&subscription.Status,
		&subscription.MessageQuota,
		&subscription.OutletLimit,
		&subscription.KnowledgeBaseLimit,
		&subscription.StorageLimitMB,
		&subscription.MonthlyPrice,
		&subscription.OverageRate,
		&subscription.StartedAt,
		&subscription.EndedAt,
		&subscription.CreatedAt,
	)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "No active subscription found for tenant",
		})
		return
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch subscription",
		})
		return
	}

	c.JSON(http.StatusOK, subscription)
}

// CreateSubscription creates a new subscription for a tenant
// POST /api/v1/billing/tenants/:tenantId/subscription
func (h *SubscriptionHandler) CreateSubscription(c *gin.Context) {
	tenantID := c.Param("tenantId")

	var req struct {
		Tier string `json:"tier" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate tier
	tier, exists := types.SubscriptionTiers[req.Tier]
	if !exists {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid tier. Must be starter, growth, or enterprise",
		})
		return
	}

	// Check if active subscription already exists
	var count int
	err := h.db.QueryRow(
		"SELECT COUNT(*) FROM subscriptions WHERE tenant_id = $1 AND status = $2",
		tenantID,
		types.StatusActive,
	).Scan(&count)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to check existing subscription",
		})
		return
	}

	if count > 0 {
		c.JSON(http.StatusConflict, gin.H{
			"error": "Active subscription already exists for this tenant",
		})
		return
	}

	// Create new subscription
	subscription := types.Subscription{
		ID:                 uuid.New(),
		TenantID:           uuid.MustParse(tenantID),
		Tier:               req.Tier,
		Status:             types.StatusActive,
		MessageQuota:       tier.MessageQuota,
		OutletLimit:        tier.OutletLimit,
		KnowledgeBaseLimit: tier.KnowledgeBaseLimit,
		StorageLimitMB:     tier.StorageLimitMB,
		MonthlyPrice:       tier.MonthlyPrice,
		OverageRate:        tier.OverageRate,
		StartedAt:          time.Now(),
		CreatedAt:          time.Now(),
	}

	query := `
		INSERT INTO subscriptions (
			id, tenant_id, tier, status, message_quota, outlet_limit,
			knowledge_base_limit, storage_limit_mb, monthly_price, overage_rate,
			started_at, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`

	_, err = h.db.Exec(query,
		subscription.ID,
		subscription.TenantID,
		subscription.Tier,
		subscription.Status,
		subscription.MessageQuota,
		subscription.OutletLimit,
		subscription.KnowledgeBaseLimit,
		subscription.StorageLimitMB,
		subscription.MonthlyPrice,
		subscription.OverageRate,
		subscription.StartedAt,
		subscription.CreatedAt,
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create subscription",
		})
		return
	}

	c.JSON(http.StatusCreated, subscription)
}

// UpdateSubscription updates a tenant's subscription tier
// PUT /api/v1/billing/tenants/:tenantId/subscription
func (h *SubscriptionHandler) UpdateSubscription(c *gin.Context) {
	tenantID := c.Param("tenantId")

	var req struct {
		Tier string `json:"tier" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate tier
	tier, exists := types.SubscriptionTiers[req.Tier]
	if !exists {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid tier. Must be starter, growth, or enterprise",
		})
		return
	}

	// Update the subscription
	query := `
		UPDATE subscriptions
		SET tier = $1,
		    message_quota = $2,
		    outlet_limit = $3,
		    knowledge_base_limit = $4,
		    storage_limit_mb = $5,
		    monthly_price = $6,
		    overage_rate = $7
		WHERE tenant_id = $8 AND status = $9
		RETURNING id, tenant_id, tier, status, message_quota, outlet_limit,
		          knowledge_base_limit, storage_limit_mb, monthly_price, overage_rate,
		          started_at, ended_at, created_at
	`

	var subscription types.Subscription
	err := h.db.QueryRow(query,
		req.Tier,
		tier.MessageQuota,
		tier.OutletLimit,
		tier.KnowledgeBaseLimit,
		tier.StorageLimitMB,
		tier.MonthlyPrice,
		tier.OverageRate,
		tenantID,
		types.StatusActive,
	).Scan(
		&subscription.ID,
		&subscription.TenantID,
		&subscription.Tier,
		&subscription.Status,
		&subscription.MessageQuota,
		&subscription.OutletLimit,
		&subscription.KnowledgeBaseLimit,
		&subscription.StorageLimitMB,
		&subscription.MonthlyPrice,
		&subscription.OverageRate,
		&subscription.StartedAt,
		&subscription.EndedAt,
		&subscription.CreatedAt,
	)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "No active subscription found for tenant",
		})
		return
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to update subscription",
		})
		return
	}

	c.JSON(http.StatusOK, subscription)
}

// CancelSubscription cancels a tenant's subscription
// DELETE /api/v1/billing/tenants/:tenantId/subscription
func (h *SubscriptionHandler) CancelSubscription(c *gin.Context) {
	tenantID := c.Param("tenantId")

	now := time.Now()
	query := `
		UPDATE subscriptions
		SET status = $1, ended_at = $2
		WHERE tenant_id = $3 AND status = $4
	`

	result, err := h.db.Exec(query, types.StatusCancelled, now, tenantID, types.StatusActive)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to cancel subscription",
		})
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "No active subscription found for tenant",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Subscription cancelled successfully",
	})
}
