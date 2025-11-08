package models

import "time"

// Resource represents a bookable resource (court, field, room, etc.)
type Resource struct {
	ID          string    `json:"id"`
	TenantID    string    `json:"tenant_id"`
	OutletID    string    `json:"outlet_id"`
	Name        string    `json:"name"`
	Type        string    `json:"type"` // futsal, tennis, badminton, etc.
	HourlyRate  float64   `json:"hourly_rate"`
	Status      string    `json:"status"` // active, maintenance, retired
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Booking represents a customer booking
type Booking struct {
	ID             string     `json:"id"`
	TenantID       string     `json:"tenant_id"`
	OutletID       string     `json:"outlet_id"`
	ResourceID     string     `json:"resource_id"`
	CustomerPhone  string     `json:"customer_phone"`
	CustomerName   *string    `json:"customer_name,omitempty"`
	ConversationID *string    `json:"conversation_id,omitempty"`
	BookingDate    string     `json:"booking_date"` // YYYY-MM-DD
	StartTime      string     `json:"start_time"`   // HH:MM
	EndTime        string     `json:"end_time"`     // HH:MM
	Status         string     `json:"status"`       // pending, confirmed, cancelled, completed, no_show
	TotalPrice     *float64   `json:"total_price,omitempty"`
	Notes          *string    `json:"notes,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

// CreateResourceRequest is the request body for creating a resource
type CreateResourceRequest struct {
	Name       string  `json:"name" binding:"required"`
	Type       string  `json:"type"`
	HourlyRate float64 `json:"hourly_rate" binding:"required"`
}

// CreateBookingRequest is the request body for creating a booking
type CreateBookingRequest struct {
	ResourceID    string  `json:"resource_id" binding:"required"`
	CustomerPhone string  `json:"customer_phone" binding:"required"`
	CustomerName  string  `json:"customer_name"`
	BookingDate   string  `json:"booking_date" binding:"required"` // YYYY-MM-DD
	StartTime     string  `json:"start_time" binding:"required"`   // HH:MM
	EndTime       string  `json:"end_time" binding:"required"`     // HH:MM
	TotalPrice    float64 `json:"total_price"`
	Notes         string  `json:"notes"`
}
