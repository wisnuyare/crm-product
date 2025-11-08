package handlers

import (
	"booking-service/internal/models"
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ListBookings returns all bookings for a tenant
func ListBookings(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		tenantID := c.GetHeader("X-Tenant-Id")
		if tenantID == "" {
			tenantID = "00000000-0000-0000-0000-000000000001" // Default for POC
		}

		// Optional filters
		resourceID := c.Query("resource_id")
		status := c.Query("status")
		date := c.Query("date")

		query := `
			SELECT b.id, b.tenant_id, b.outlet_id, b.resource_id, b.customer_phone, b.customer_name,
			       b.conversation_id, b.booking_date, b.start_time, b.end_time, b.status,
			       b.total_price, b.notes, b.created_at, b.updated_at,
			       r.name as resource_name, r.type as resource_type
			FROM bookings b
			JOIN resources r ON b.resource_id = r.id
			WHERE b.tenant_id = $1
		`

		args := []interface{}{tenantID}
		argCount := 1

		if resourceID != "" {
			argCount++
			query += ` AND b.resource_id = $` + string(rune('0'+argCount))
			args = append(args, resourceID)
		}

		if status != "" {
			argCount++
			query += ` AND b.status = $` + string(rune('0'+argCount))
			args = append(args, status)
		}

		if date != "" {
			argCount++
			query += ` AND b.booking_date = $` + string(rune('0'+argCount))
			args = append(args, date)
		}

		query += ` ORDER BY b.booking_date DESC, b.start_time DESC LIMIT 100`

		rows, err := db.Query(query, args...)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch bookings", "details": err.Error()})
			return
		}
		defer rows.Close()

		type BookingWithResource struct {
			models.Booking
			ResourceName string `json:"resource_name"`
			ResourceType string `json:"resource_type"`
		}

		var bookings []BookingWithResource
		for rows.Next() {
			var b BookingWithResource
			if err := rows.Scan(
				&b.ID, &b.TenantID, &b.OutletID, &b.ResourceID, &b.CustomerPhone, &b.CustomerName,
				&b.ConversationID, &b.BookingDate, &b.StartTime, &b.EndTime, &b.Status,
				&b.TotalPrice, &b.Notes, &b.CreatedAt, &b.UpdatedAt,
				&b.ResourceName, &b.ResourceType,
			); err != nil {
				continue
			}
			bookings = append(bookings, b)
		}

		c.JSON(http.StatusOK, gin.H{
			"bookings": bookings,
			"total":    len(bookings),
		})
	}
}

// GetBooking returns a single booking by ID
func GetBooking(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		tenantID := c.GetHeader("X-Tenant-Id")
		if tenantID == "" {
			tenantID = "00000000-0000-0000-0000-000000000001"
		}

		query := `
			SELECT b.id, b.tenant_id, b.outlet_id, b.resource_id, b.customer_phone, b.customer_name,
			       b.conversation_id, b.booking_date, b.start_time, b.end_time, b.status,
			       b.total_price, b.notes, b.created_at, b.updated_at,
			       r.name as resource_name, r.type as resource_type
			FROM bookings b
			JOIN resources r ON b.resource_id = r.id
			WHERE b.id = $1 AND b.tenant_id = $2
		`

		type BookingWithResource struct {
			models.Booking
			ResourceName string `json:"resource_name"`
			ResourceType string `json:"resource_type"`
		}

		var b BookingWithResource
		err := db.QueryRow(query, id, tenantID).Scan(
			&b.ID, &b.TenantID, &b.OutletID, &b.ResourceID, &b.CustomerPhone, &b.CustomerName,
			&b.ConversationID, &b.BookingDate, &b.StartTime, &b.EndTime, &b.Status,
			&b.TotalPrice, &b.Notes, &b.CreatedAt, &b.UpdatedAt,
			&b.ResourceName, &b.ResourceType,
		)

		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Booking not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch booking"})
			return
		}

		c.JSON(http.StatusOK, b)
	}
}

// CreateBooking creates a new booking
func CreateBooking(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req models.CreateBookingRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		tenantID := c.GetHeader("X-Tenant-Id")
		if tenantID == "" {
			tenantID = "00000000-0000-0000-0000-000000000001"
		}

		// Get outlet_id from resource
		var outletID string
		err := db.QueryRow("SELECT outlet_id FROM resources WHERE id = $1", req.ResourceID).Scan(&outletID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid resource ID"})
			return
		}

		// Check for conflicts (simple version - just check exact time match)
		var existingCount int
		conflictQuery := `
			SELECT COUNT(*) FROM bookings
			WHERE resource_id = $1
			  AND booking_date = $2
			  AND start_time = $3
			  AND end_time = $4
			  AND status NOT IN ('cancelled')
		`
		err = db.QueryRow(conflictQuery, req.ResourceID, req.BookingDate, req.StartTime, req.EndTime).Scan(&existingCount)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check availability"})
			return
		}

		if existingCount > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "Time slot already booked"})
			return
		}

		query := `
			INSERT INTO bookings (id, tenant_id, outlet_id, resource_id, customer_phone, customer_name,
			                      booking_date, start_time, end_time, status, total_price, notes)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, $11)
			RETURNING id, tenant_id, outlet_id, resource_id, customer_phone, customer_name,
			          conversation_id, booking_date, start_time, end_time, status,
			          total_price, notes, created_at, updated_at
		`

		id := uuid.New().String()
		var b models.Booking
		err = db.QueryRow(
			query, id, tenantID, outletID, req.ResourceID, req.CustomerPhone, req.CustomerName,
			req.BookingDate, req.StartTime, req.EndTime, req.TotalPrice, req.Notes,
		).Scan(
			&b.ID, &b.TenantID, &b.OutletID, &b.ResourceID, &b.CustomerPhone, &b.CustomerName,
			&b.ConversationID, &b.BookingDate, &b.StartTime, &b.EndTime, &b.Status,
			&b.TotalPrice, &b.Notes, &b.CreatedAt, &b.UpdatedAt,
		)

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create booking", "details": err.Error()})
			return
		}

		c.JSON(http.StatusCreated, gin.H{
			"message": "Booking created successfully",
			"booking": b,
		})
	}
}
