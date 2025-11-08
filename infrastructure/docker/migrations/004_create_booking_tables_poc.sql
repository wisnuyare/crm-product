-- Migration 004: Booking System POC - Minimal Schema
-- Created: 2025-11-07
-- Purpose: POC with 2 tables (resources + bookings) to validate concept

-- Table 1: Resources (courts, fields, rooms, studios)
CREATE TABLE IF NOT EXISTS resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100),
  hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'retired')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT unique_resource_name_per_outlet UNIQUE(outlet_id, name)
);

-- Table 2: Bookings (simplified - full schema will come in MVP)
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  customer_phone VARCHAR(50) NOT NULL,
  customer_name VARCHAR(255),
  conversation_id UUID REFERENCES conversations(id),
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  total_price DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT check_time_order CHECK (end_time > start_time)
);

-- Indexes for performance
CREATE INDEX idx_resources_tenant ON resources(tenant_id);
CREATE INDEX idx_resources_outlet ON resources(outlet_id);
CREATE INDEX idx_resources_status ON resources(status);

CREATE INDEX idx_bookings_tenant ON bookings(tenant_id);
CREATE INDEX idx_bookings_outlet ON bookings(outlet_id);
CREATE INDEX idx_bookings_resource_date ON bookings(resource_id, booking_date);
CREATE INDEX idx_bookings_customer ON bookings(customer_phone);
CREATE INDEX idx_bookings_date_time ON bookings(booking_date, start_time);

-- Unique constraint to prevent double bookings (simplified - no overlap check yet)
CREATE UNIQUE INDEX idx_bookings_no_overlap ON bookings(resource_id, booking_date, start_time, end_time)
WHERE status NOT IN ('cancelled');

-- Seed data for testing
-- Tenant 1: Sample Sports Complex
INSERT INTO resources (tenant_id, outlet_id, name, type, hourly_rate, status)
VALUES
  ('00000000-0000-0000-0000-000000000001',
   (SELECT id FROM outlets WHERE tenant_id = '00000000-0000-0000-0000-000000000001' LIMIT 1),
   'Court A', 'futsal', 200000, 'active'),
  ('00000000-0000-0000-0000-000000000001',
   (SELECT id FROM outlets WHERE tenant_id = '00000000-0000-0000-0000-000000000001' LIMIT 1),
   'Court B', 'futsal', 200000, 'active'),
  ('00000000-0000-0000-0000-000000000001',
   (SELECT id FROM outlets WHERE tenant_id = '00000000-0000-0000-0000-000000000001' LIMIT 1),
   'Tennis Court 1', 'tennis', 150000, 'active')
ON CONFLICT (outlet_id, name) DO NOTHING;

-- Sample bookings for today
INSERT INTO bookings (tenant_id, outlet_id, resource_id, customer_phone, customer_name, booking_date, start_time, end_time, status, total_price)
VALUES
  ('00000000-0000-0000-0000-000000000001',
   (SELECT id FROM outlets WHERE tenant_id = '00000000-0000-0000-0000-000000000001' LIMIT 1),
   (SELECT id FROM resources WHERE name = 'Court A' LIMIT 1),
   '+628123456789', 'Andi Wijaya', CURRENT_DATE, '18:00', '19:00', 'confirmed', 200000),
  ('00000000-0000-0000-0000-000000000001',
   (SELECT id FROM outlets WHERE tenant_id = '00000000-0000-0000-0000-000000000001' LIMIT 1),
   (SELECT id FROM resources WHERE name = 'Court A' LIMIT 1),
   '+628987654321', 'Budi Santoso', CURRENT_DATE, '19:00', '20:00', 'pending', 200000),
  ('00000000-0000-0000-0000-000000000001',
   (SELECT id FROM outlets WHERE tenant_id = '00000000-0000-0000-0000-000000000001' LIMIT 1),
   (SELECT id FROM resources WHERE name = 'Tennis Court 1' LIMIT 1),
   '+628111222333', 'Cici Lestari', CURRENT_DATE + 1, '07:00', '08:00', 'confirmed', 150000)
ON CONFLICT DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE resources IS 'POC: Bookable resources (courts, fields, rooms, studios)';
COMMENT ON TABLE bookings IS 'POC: Customer bookings - simplified schema for validation';
COMMENT ON COLUMN bookings.status IS 'pending: awaiting confirmation, confirmed: booking confirmed, cancelled: booking cancelled, completed: session finished, no_show: customer did not show up';
