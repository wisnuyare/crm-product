package handlers

import (
	"booking-service/internal/models"
	"database/sql"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// TimeSlot represents an available time slot for booking
type TimeSlot struct {
	StartTime string  `json:"start_time"`
	EndTime   string  `json:"end_time"`
	Price     float64 `json:"price"`
}

// BookedTimeSlot represents a booked time slot
type BookedTimeSlot struct {
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
	Status    string `json:"status"`
}

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

// CheckAvailability checks available time slots for a resource on a specific date
func CheckAvailability(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		resourceID := c.Query("resource_id")
		date := c.Query("date")
		resourceType := c.Query("resource_type") // optional: filter by type (futsal, tennis, etc.)

		tenantID := c.GetHeader("X-Tenant-Id")
		if tenantID == "" {
			tenantID = "00000000-0000-0000-0000-000000000001"
		}

		// Validate inputs
		if date == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "date parameter is required (format: YYYY-MM-DD)"})
			return
		}

		// Parse date to validate format
		_, err := time.Parse("2006-01-02", date)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid date format. Use YYYY-MM-DD"})
			return
		}

		// Build query to get resources and their bookings
		var resourceQuery string
		var args []interface{}

		if resourceID != "" {
			// Check specific resource
			resourceQuery = `
				SELECT r.id, r.name, r.type, r.hourly_rate
				FROM resources r
				WHERE r.id = $1 AND r.tenant_id = $2 AND r.status = 'active'
			`
			args = []interface{}{resourceID, tenantID}
		} else if resourceType != "" {
			// Check resources by type (e.g., all futsal fields)
			resourceQuery = `
				SELECT r.id, r.name, r.type, r.hourly_rate
				FROM resources r
				WHERE r.type = $1 AND r.tenant_id = $2 AND r.status = 'active'
			`
			args = []interface{}{resourceType, tenantID}
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Either resource_id or resource_type parameter is required"})
			return
		}

		// Fetch resources
		rows, err := db.Query(resourceQuery, args...)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch resources", "details": err.Error()})
			return
		}
		defer rows.Close()

		type ResourceAvailability struct {
			ResourceID   string              `json:"resource_id"`
			ResourceName string              `json:"resource_name"`
			ResourceType string              `json:"resource_type"`
			HourlyRate   float64             `json:"hourly_rate"`
			Date         string              `json:"date"`
			AvailableSlots []TimeSlot        `json:"available_slots"`
			BookedSlots    []BookedTimeSlot  `json:"booked_slots"`
		}

		var availabilities []ResourceAvailability

		for rows.Next() {
			var resID, resName, resType string
			var hourlyRate float64

			if err := rows.Scan(&resID, &resName, &resType, &hourlyRate); err != nil {
				continue
			}

			// Fetch existing bookings for this resource on this date
			bookingQuery := `
				SELECT start_time, end_time, status
				FROM bookings
				WHERE resource_id = $1 AND booking_date = $2 AND status NOT IN ('cancelled')
				ORDER BY start_time
			`

			bookingRows, err := db.Query(bookingQuery, resID, date)
			if err != nil {
				continue
			}

			var bookedSlots []BookedTimeSlot
			for bookingRows.Next() {
				var slot BookedTimeSlot
				if err := bookingRows.Scan(&slot.StartTime, &slot.EndTime, &slot.Status); err != nil {
					continue
				}
				bookedSlots = append(bookedSlots, slot)
			}
			bookingRows.Close()

			// Generate standard time slots (08:00 - 22:00, hourly intervals)
			standardSlots := generateStandardSlots(hourlyRate)

			// Filter out booked slots
			availableSlots := filterAvailableSlots(standardSlots, bookedSlots)

			availabilities = append(availabilities, ResourceAvailability{
				ResourceID:     resID,
				ResourceName:   resName,
				ResourceType:   resType,
				HourlyRate:     hourlyRate,
				Date:           date,
				AvailableSlots: availableSlots,
				BookedSlots:    bookedSlots,
			})
		}

		if len(availabilities) == 0 {
			c.JSON(http.StatusNotFound, gin.H{
				"message": "No resources found matching criteria",
				"date":    date,
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"availabilities": availabilities,
			"date":           date,
			"total_resources": len(availabilities),
		})
	}
}

// generateStandardSlots generates hourly time slots from 08:00 to 22:00
func generateStandardSlots(hourlyRate float64) []TimeSlot {
	slots := []TimeSlot{}

	for hour := 8; hour < 22; hour++ {
		startTime := time.Date(2000, 1, 1, hour, 0, 0, 0, time.UTC)
		endTime := startTime.Add(1 * time.Hour)

		slots = append(slots, TimeSlot{
			StartTime: startTime.Format("15:04"),
			EndTime:   endTime.Format("15:04"),
			Price:     hourlyRate,
		})
	}

	return slots
}

// filterAvailableSlots filters out time slots that are already booked
func filterAvailableSlots(allSlots []TimeSlot, bookedSlots []BookedTimeSlot) []TimeSlot {
	var available []TimeSlot

	for _, slot := range allSlots {
		isBooked := false

		for _, booked := range bookedSlots {
			// Check if times overlap
			if timeOverlaps(slot.StartTime, slot.EndTime, booked.StartTime, booked.EndTime) {
				isBooked = true
				break
			}
		}

		if !isBooked {
			available = append(available, slot)
		}
	}

	return available
}

// timeOverlaps checks if two time ranges overlap
func timeOverlaps(start1, end1, start2, end2 string) bool {
	// Parse times (format: "HH:MM")
	s1, _ := time.Parse("15:04", start1)
	e1, _ := time.Parse("15:04", end1)
	s2, _ := time.Parse("15:04", start2)
	e2, _ := time.Parse("15:04", end2)

	// Check for overlap: (start1 < end2) and (end1 > start2)
	return s1.Before(e2) && e1.After(s2)
}
