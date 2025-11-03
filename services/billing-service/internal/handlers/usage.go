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

type UsageHandler struct {
	db *database.DB
}

func NewUsageHandler(db *database.DB) *UsageHandler {
	return &UsageHandler{db: db}
}

// GetUsage returns usage for a tenant in the current billing period
// GET /api/v1/billing/tenants/:tenantId/usage
func (h *UsageHandler) GetUsage(c *gin.Context) {
	tenantID := c.Param("tenantId")

	// Calculate current billing period (monthly)
	now := time.Now()
	periodStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	periodEnd := periodStart.AddDate(0, 1, 0)

	query := `
		SELECT id, tenant_id, usage_type, count, period_start, period_end, created_at, updated_at
		FROM usage_records
		WHERE tenant_id = $1
		  AND period_start = $2
		  AND period_end = $3
		ORDER BY usage_type
	`

	rows, err := h.db.Query(query, tenantID, periodStart, periodEnd)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch usage",
		})
		return
	}
	defer rows.Close()

	var usageRecords []types.UsageRecord
	for rows.Next() {
		var record types.UsageRecord
		err := rows.Scan(
			&record.ID,
			&record.TenantID,
			&record.UsageType,
			&record.Count,
			&record.PeriodStart,
			&record.PeriodEnd,
			&record.CreatedAt,
			&record.UpdatedAt,
		)
		if err != nil {
			continue
		}
		usageRecords = append(usageRecords, record)
	}

	c.JSON(http.StatusOK, gin.H{
		"period_start": periodStart,
		"period_end":   periodEnd,
		"usage":        usageRecords,
	})
}

// RecordUsage records usage for a tenant (upsert pattern)
// POST /api/v1/billing/tenants/:tenantId/usage
func (h *UsageHandler) RecordUsage(c *gin.Context) {
	tenantID := c.Param("tenantId")

	var req struct {
		UsageType string `json:"usageType" binding:"required,oneof=messages storage knowledge_base"`
		Count     int    `json:"count" binding:"required,gt=0"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Calculate current billing period
	now := time.Now()
	periodStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	periodEnd := periodStart.AddDate(0, 1, 0)

	// Upsert usage record (PostgreSQL ON CONFLICT)
	query := `
		INSERT INTO usage_records (
			id, tenant_id, usage_type, count, period_start, period_end, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (tenant_id, usage_type, period_start, period_end)
		DO UPDATE SET
			count = usage_records.count + EXCLUDED.count,
			updated_at = EXCLUDED.updated_at
		RETURNING id, tenant_id, usage_type, count, period_start, period_end, created_at, updated_at
	`

	var usageRecord types.UsageRecord
	err := h.db.QueryRow(query,
		uuid.New(),
		tenantID,
		req.UsageType,
		req.Count,
		periodStart,
		periodEnd,
		now,
		now,
	).Scan(
		&usageRecord.ID,
		&usageRecord.TenantID,
		&usageRecord.UsageType,
		&usageRecord.Count,
		&usageRecord.PeriodStart,
		&usageRecord.PeriodEnd,
		&usageRecord.CreatedAt,
		&usageRecord.UpdatedAt,
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to record usage",
		})
		return
	}

	c.JSON(http.StatusOK, usageRecord)
}

// GetQuotaStatus returns current quota status (usage vs limits)
// GET /api/v1/billing/tenants/:tenantId/quota
func (h *UsageHandler) GetQuotaStatus(c *gin.Context) {
	tenantID := c.Param("tenantId")

	// Get active subscription
	var subscription types.Subscription
	subQuery := `
		SELECT id, tenant_id, tier, status, message_quota, outlet_limit,
		       knowledge_base_limit, storage_limit_mb, monthly_price, overage_rate,
		       started_at, ended_at, created_at
		FROM subscriptions
		WHERE tenant_id = $1 AND status = $2
		ORDER BY created_at DESC
		LIMIT 1
	`

	err := h.db.QueryRow(subQuery, tenantID, types.StatusActive).Scan(
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

	// Get current usage
	now := time.Now()
	periodStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	periodEnd := periodStart.AddDate(0, 1, 0)

	usageQuery := `
		SELECT usage_type, count
		FROM usage_records
		WHERE tenant_id = $1
		  AND period_start = $2
		  AND period_end = $3
	`

	rows, err := h.db.Query(usageQuery, tenantID, periodStart, periodEnd)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch usage",
		})
		return
	}
	defer rows.Close()

	usage := make(map[string]int)
	for rows.Next() {
		var usageType string
		var count int
		if err := rows.Scan(&usageType, &count); err != nil {
			continue
		}
		usage[usageType] = count
	}

	// Calculate quota status
	messageUsage := usage[types.UsageTypeMessages]
	storageUsage := usage[types.UsageTypeStorage]

	messagePercent := float64(messageUsage) / float64(subscription.MessageQuota) * 100
	storagePercent := float64(storageUsage) / float64(subscription.StorageLimitMB) * 100

	// Check if over quota
	overQuota := messagePercent > 105 || storagePercent > 105

	// Get deposit balance
	var depositBalance float64
	depositQuery := `
		SELECT balance FROM deposits
		WHERE tenant_id = $1
		ORDER BY created_at DESC
		LIMIT 1
	`
	_ = h.db.QueryRow(depositQuery, tenantID).Scan(&depositBalance)

	// Calculate overage costs
	messageOverage := 0
	if messageUsage > subscription.MessageQuota {
		messageOverage = messageUsage - subscription.MessageQuota
	}

	storageOverage := 0
	if storageUsage > subscription.StorageLimitMB {
		storageOverage = storageUsage - subscription.StorageLimitMB
	}

	overageCost := float64(messageOverage) * subscription.OverageRate

	c.JSON(http.StatusOK, gin.H{
		"subscription": gin.H{
			"tier":                  subscription.Tier,
			"message_quota":         subscription.MessageQuota,
			"storage_limit_mb":      subscription.StorageLimitMB,
			"knowledge_base_limit":  subscription.KnowledgeBaseLimit,
			"outlet_limit":          subscription.OutletLimit,
			"overage_rate":          subscription.OverageRate,
		},
		"usage": gin.H{
			"messages":       messageUsage,
			"storage_mb":     storageUsage,
			"knowledge_base": usage[types.UsageTypeKnowledgeBase],
		},
		"quota_percent": gin.H{
			"messages": messagePercent,
			"storage":  storagePercent,
		},
		"over_quota": overQuota,
		"overage": gin.H{
			"messages": messageOverage,
			"storage":  storageOverage,
			"cost":     overageCost,
		},
		"deposit_balance": depositBalance,
		"period_start":    periodStart,
		"period_end":      periodEnd,
	})
}

// CheckQuota validates if tenant can perform an action based on quotas
// POST /api/v1/billing/tenants/:tenantId/quota/check
func (h *UsageHandler) CheckQuota(c *gin.Context) {
	tenantID := c.Param("tenantId")

	var req struct {
		UsageType string `json:"usageType" binding:"required,oneof=messages storage knowledge_base outlet"`
		Count     int    `json:"count" binding:"required,gt=0"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get subscription and usage
	var subscription types.Subscription
	subQuery := `
		SELECT message_quota, storage_limit_mb, knowledge_base_limit, outlet_limit, overage_rate
		FROM subscriptions
		WHERE tenant_id = $1 AND status = $2
		ORDER BY created_at DESC
		LIMIT 1
	`

	err := h.db.QueryRow(subQuery, tenantID, types.StatusActive).Scan(
		&subscription.MessageQuota,
		&subscription.StorageLimitMB,
		&subscription.KnowledgeBaseLimit,
		&subscription.OutletLimit,
		&subscription.OverageRate,
	)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusForbidden, gin.H{
			"allowed": false,
			"reason":  "No active subscription",
		})
		return
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to check quota",
		})
		return
	}

	// Get current usage
	now := time.Now()
	periodStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	periodEnd := periodStart.AddDate(0, 1, 0)

	var currentUsage int
	usageQuery := `
		SELECT COALESCE(count, 0)
		FROM usage_records
		WHERE tenant_id = $1
		  AND usage_type = $2
		  AND period_start = $3
		  AND period_end = $4
	`
	_ = h.db.QueryRow(usageQuery, tenantID, req.UsageType, periodStart, periodEnd).Scan(&currentUsage)

	// Determine quota limit based on usage type
	var limit int
	switch req.UsageType {
	case types.UsageTypeMessages:
		limit = subscription.MessageQuota
	case types.UsageTypeStorage:
		limit = subscription.StorageLimitMB
	case types.UsageTypeKnowledgeBase:
		limit = subscription.KnowledgeBaseLimit
	case "outlet":
		limit = subscription.OutletLimit
	}

	// Check if unlimited (-1)
	if limit == -1 {
		c.JSON(http.StatusOK, gin.H{
			"allowed":       true,
			"unlimited":     true,
			"current_usage": currentUsage,
		})
		return
	}

	newUsage := currentUsage + req.Count
	usagePercent := float64(newUsage) / float64(limit) * 100

	// Hard limit at 105%
	if usagePercent > 105 {
		c.JSON(http.StatusForbidden, gin.H{
			"allowed":       false,
			"reason":        "Quota exceeded (105% hard limit)",
			"current_usage": currentUsage,
			"limit":         limit,
			"percent":       usagePercent,
		})
		return
	}

	// Between 100% and 105% - check deposit
	if usagePercent > 100 {
		var depositBalance float64
		depositQuery := `SELECT balance FROM deposits WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`
		_ = h.db.QueryRow(depositQuery, tenantID).Scan(&depositBalance)

		overage := newUsage - limit
		overageCost := float64(overage) * subscription.OverageRate

		if depositBalance < overageCost {
			c.JSON(http.StatusPaymentRequired, gin.H{
				"allowed":         false,
				"reason":          "Insufficient deposit for overage",
				"deposit_balance": depositBalance,
				"overage_cost":    overageCost,
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"allowed":         true,
			"warning":         "Using overage quota",
			"overage_cost":    overageCost,
			"deposit_balance": depositBalance,
			"current_usage":   currentUsage,
			"limit":           limit,
			"percent":         usagePercent,
		})
		return
	}

	// Within normal quota
	c.JSON(http.StatusOK, gin.H{
		"allowed":       true,
		"current_usage": currentUsage,
		"limit":         limit,
		"percent":       usagePercent,
	})
}
