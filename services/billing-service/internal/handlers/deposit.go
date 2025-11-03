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

type DepositHandler struct {
	db *database.DB
}

func NewDepositHandler(db *database.DB) *DepositHandler {
	return &DepositHandler{db: db}
}

// GetDeposit returns the current deposit balance for a tenant
// GET /api/v1/billing/tenants/:tenantId/deposit
func (h *DepositHandler) GetDeposit(c *gin.Context) {
	tenantID := c.Param("tenantId")

	var deposit types.Deposit
	query := `
		SELECT id, tenant_id, amount, balance, created_at, updated_at
		FROM deposits
		WHERE tenant_id = $1
		ORDER BY created_at DESC
		LIMIT 1
	`

	err := h.db.QueryRow(query, tenantID).Scan(
		&deposit.ID,
		&deposit.TenantID,
		&deposit.Amount,
		&deposit.Balance,
		&deposit.CreatedAt,
		&deposit.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusOK, gin.H{
			"balance": 0.0,
			"message": "No deposit found for tenant",
		})
		return
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch deposit",
		})
		return
	}

	c.JSON(http.StatusOK, deposit)
}

// AddDeposit adds funds to a tenant's deposit account
// POST /api/v1/billing/tenants/:tenantId/deposit
func (h *DepositHandler) AddDeposit(c *gin.Context) {
	tenantID := c.Param("tenantId")

	var req struct {
		Amount float64 `json:"amount" binding:"required,gt=0"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Check if deposit already exists
	var existingDeposit types.Deposit
	err := h.db.QueryRow(
		"SELECT id, balance FROM deposits WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1",
		tenantID,
	).Scan(&existingDeposit.ID, &existingDeposit.Balance)

	now := time.Now()

	if err == sql.ErrNoRows {
		// Create new deposit
		deposit := types.Deposit{
			ID:        uuid.New(),
			TenantID:  uuid.MustParse(tenantID),
			Amount:    req.Amount,
			Balance:   req.Amount,
			CreatedAt: now,
			UpdatedAt: now,
		}

		query := `
			INSERT INTO deposits (id, tenant_id, amount, balance, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6)
		`

		_, err = h.db.Exec(query,
			deposit.ID,
			deposit.TenantID,
			deposit.Amount,
			deposit.Balance,
			deposit.CreatedAt,
			deposit.UpdatedAt,
		)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to create deposit",
			})
			return
		}

		c.JSON(http.StatusCreated, deposit)
		return
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to check existing deposit",
		})
		return
	}

	// Update existing deposit
	newBalance := existingDeposit.Balance + req.Amount

	query := `
		UPDATE deposits
		SET amount = amount + $1,
		    balance = $2,
		    updated_at = $3
		WHERE id = $4
		RETURNING id, tenant_id, amount, balance, created_at, updated_at
	`

	var updatedDeposit types.Deposit
	err = h.db.QueryRow(query, req.Amount, newBalance, now, existingDeposit.ID).Scan(
		&updatedDeposit.ID,
		&updatedDeposit.TenantID,
		&updatedDeposit.Amount,
		&updatedDeposit.Balance,
		&updatedDeposit.CreatedAt,
		&updatedDeposit.UpdatedAt,
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to update deposit",
		})
		return
	}

	c.JSON(http.StatusOK, updatedDeposit)
}

// DeductDeposit deducts funds from a tenant's deposit (for overage charges)
// POST /api/v1/billing/tenants/:tenantId/deposit/deduct
func (h *DepositHandler) DeductDeposit(c *gin.Context) {
	tenantID := c.Param("tenantId")

	var req struct {
		Amount float64 `json:"amount" binding:"required,gt=0"`
		Reason string  `json:"reason" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get current deposit
	var deposit types.Deposit
	err := h.db.QueryRow(
		"SELECT id, balance FROM deposits WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1",
		tenantID,
	).Scan(&deposit.ID, &deposit.Balance)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "No deposit found for tenant",
		})
		return
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch deposit",
		})
		return
	}

	// Check if sufficient balance
	if deposit.Balance < req.Amount {
		c.JSON(http.StatusPaymentRequired, gin.H{
			"error":           "Insufficient deposit balance",
			"current_balance": deposit.Balance,
			"requested":       req.Amount,
		})
		return
	}

	// Deduct from balance
	newBalance := deposit.Balance - req.Amount
	now := time.Now()

	query := `
		UPDATE deposits
		SET balance = $1,
		    updated_at = $2
		WHERE id = $3
		RETURNING id, tenant_id, amount, balance, created_at, updated_at
	`

	var updatedDeposit types.Deposit
	err = h.db.QueryRow(query, newBalance, now, deposit.ID).Scan(
		&updatedDeposit.ID,
		&updatedDeposit.TenantID,
		&updatedDeposit.Amount,
		&updatedDeposit.Balance,
		&updatedDeposit.CreatedAt,
		&updatedDeposit.UpdatedAt,
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to deduct deposit",
		})
		return
	}

	// TODO: Publish event to Pub/Sub for audit logging
	// pubsub.Publish("billing.deposit.deducted", {
	//   tenant_id: tenantID,
	//   amount: req.Amount,
	//   reason: req.Reason,
	//   new_balance: newBalance,
	// })

	c.JSON(http.StatusOK, gin.H{
		"message":     "Deposit deducted successfully",
		"deducted":    req.Amount,
		"new_balance": updatedDeposit.Balance,
		"reason":      req.Reason,
	})
}
