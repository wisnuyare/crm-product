package types

import (
	"time"

	"github.com/google/uuid"
)

// SubscriptionTier represents the pricing tier
type SubscriptionTier struct {
	Name               string  `json:"name"`
	MonthlyPrice       float64 `json:"monthlyPrice"`
	MessageQuota       int     `json:"messageQuota"`
	OutletLimit        int     `json:"outletLimit"`
	KnowledgeBaseLimit int     `json:"knowledgeBaseLimit"`
	StorageLimitMB     int     `json:"storageLimitMB"`
	OverageRate        float64 `json:"overageRate"`
}

// Subscription represents a tenant's subscription
type Subscription struct {
	ID                 uuid.UUID  `json:"id" db:"id"`
	TenantID           uuid.UUID  `json:"tenantId" db:"tenant_id"`
	Tier               string     `json:"tier" db:"tier"`
	Status             string     `json:"status" db:"status"`
	MessageQuota       int        `json:"messageQuota" db:"message_quota"`
	OutletLimit        int        `json:"outletLimit" db:"outlet_limit"`
	KnowledgeBaseLimit int        `json:"knowledgeBaseLimit" db:"knowledge_base_limit"`
	StorageLimitMB     int        `json:"storageLimitMB" db:"storage_limit_mb"`
	MonthlyPrice       float64    `json:"monthlyPrice" db:"monthly_price"`
	OverageRate        float64    `json:"overageRate" db:"overage_rate"`
	StartedAt          time.Time  `json:"startedAt" db:"started_at"`
	EndedAt            *time.Time `json:"endedAt,omitempty" db:"ended_at"`
	CreatedAt          time.Time  `json:"createdAt" db:"created_at"`
}

// Deposit represents prepaid balance for overages
type Deposit struct {
	ID        uuid.UUID `json:"id" db:"id"`
	TenantID  uuid.UUID `json:"tenantId" db:"tenant_id"`
	Amount    float64   `json:"amount" db:"amount"`
	Balance   float64   `json:"balance" db:"balance"`
	CreatedAt time.Time `json:"createdAt" db:"created_at"`
	UpdatedAt time.Time `json:"updatedAt" db:"updated_at"`
}

// UsageRecord represents usage tracking
type UsageRecord struct {
	ID          uuid.UUID `json:"id" db:"id"`
	TenantID    uuid.UUID `json:"tenantId" db:"tenant_id"`
	UsageType   string    `json:"usageType" db:"usage_type"`
	Count       int       `json:"count" db:"count"`
	PeriodStart time.Time `json:"periodStart" db:"period_start"`
	PeriodEnd   time.Time `json:"periodEnd" db:"period_end"`
	CreatedAt   time.Time `json:"createdAt" db:"created_at"`
	UpdatedAt   time.Time `json:"updatedAt" db:"updated_at"`
}

// Invoice represents billing invoice
type Invoice struct {
	ID            uuid.UUID  `json:"id" db:"id"`
	TenantID      uuid.UUID  `json:"tenantId" db:"tenant_id"`
	InvoiceNumber string     `json:"invoiceNumber" db:"invoice_number"`
	Amount        float64    `json:"amount" db:"amount"`
	Status        string     `json:"status" db:"status"`
	DueDate       time.Time  `json:"dueDate" db:"due_date"`
	PaidAt        *time.Time `json:"paidAt,omitempty" db:"paid_at"`
	CreatedAt     time.Time  `json:"createdAt" db:"created_at"`
}

// Subscription status constants
const (
	StatusActive    = "active"
	StatusCancelled = "cancelled"
	StatusExpired   = "expired"
)

// Tier constants
const (
	TierStarter    = "starter"
	TierGrowth     = "growth"
	TierEnterprise = "enterprise"
)

// Usage type constants
const (
	UsageTypeMessages       = "messages"
	UsageTypeStorage        = "storage"
	UsageTypeKnowledgeBase  = "knowledge_base"
)

// SubscriptionTiers defines all available tiers
var SubscriptionTiers = map[string]SubscriptionTier{
	TierStarter: {
		Name:               "Starter",
		MonthlyPrice:       99.00,
		MessageQuota:       500,
		OutletLimit:        1,
		KnowledgeBaseLimit: 1,
		StorageLimitMB:     50,
		OverageRate:        0.10,
	},
	TierGrowth: {
		Name:               "Growth",
		MonthlyPrice:       299.00,
		MessageQuota:       2000,
		OutletLimit:        3,
		KnowledgeBaseLimit: 3,
		StorageLimitMB:     200,
		OverageRate:        0.08,
	},
	TierEnterprise: {
		Name:               "Enterprise",
		MonthlyPrice:       799.00,
		MessageQuota:       10000,
		OutletLimit:        10,
		KnowledgeBaseLimit: -1, // unlimited
		StorageLimitMB:     1024,
		OverageRate:        0.05,
	},
}
