package handlers

import (
	"booking-service/internal/models"
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ListResources returns all resources for a tenant
func ListResources(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		tenantID := c.GetHeader("X-Tenant-Id")
		if tenantID == "" {
			tenantID = "00000000-0000-0000-0000-000000000001" // Default for POC
		}

		query := `
			SELECT id, tenant_id, outlet_id, name, type, hourly_rate, status, created_at, updated_at
			FROM resources
			WHERE tenant_id = $1
			ORDER BY name ASC
		`

		rows, err := db.Query(query, tenantID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch resources"})
			return
		}
		defer rows.Close()

		var resources []models.Resource
		for rows.Next() {
			var r models.Resource
			if err := rows.Scan(&r.ID, &r.TenantID, &r.OutletID, &r.Name, &r.Type, &r.HourlyRate, &r.Status, &r.CreatedAt, &r.UpdatedAt); err != nil {
				continue
			}
			resources = append(resources, r)
		}

		c.JSON(http.StatusOK, gin.H{
			"resources": resources,
			"total":     len(resources),
		})
	}
}

// GetResource returns a single resource by ID
func GetResource(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		tenantID := c.GetHeader("X-Tenant-Id")
		if tenantID == "" {
			tenantID = "00000000-0000-0000-0000-000000000001"
		}

		query := `
			SELECT id, tenant_id, outlet_id, name, type, hourly_rate, status, created_at, updated_at
			FROM resources
			WHERE id = $1 AND tenant_id = $2
		`

		var r models.Resource
		err := db.QueryRow(query, id, tenantID).Scan(
			&r.ID, &r.TenantID, &r.OutletID, &r.Name, &r.Type,
			&r.HourlyRate, &r.Status, &r.CreatedAt, &r.UpdatedAt,
		)

		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Resource not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch resource"})
			return
		}

		c.JSON(http.StatusOK, r)
	}
}

// CreateResource creates a new resource
func CreateResource(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req models.CreateResourceRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		tenantID := c.GetHeader("X-Tenant-Id")
		if tenantID == "" {
			tenantID = "00000000-0000-0000-0000-000000000001"
		}

		// Get first outlet for this tenant
		var outletID string
		err := db.QueryRow("SELECT id FROM outlets WHERE tenant_id = $1 LIMIT 1", tenantID).Scan(&outletID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to find outlet"})
			return
		}

		query := `
			INSERT INTO resources (id, tenant_id, outlet_id, name, type, hourly_rate, status)
			VALUES ($1, $2, $3, $4, $5, $6, 'active')
			RETURNING id, tenant_id, outlet_id, name, type, hourly_rate, status, created_at, updated_at
		`

		id := uuid.New().String()
		var r models.Resource
		err = db.QueryRow(query, id, tenantID, outletID, req.Name, req.Type, req.HourlyRate).Scan(
			&r.ID, &r.TenantID, &r.OutletID, &r.Name, &r.Type,
			&r.HourlyRate, &r.Status, &r.CreatedAt, &r.UpdatedAt,
		)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create resource"})
			return
		}

		c.JSON(http.StatusCreated, r)
	}
}
