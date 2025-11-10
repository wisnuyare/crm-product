-- Order Management POC Migration
-- Creates tables for products, orders, order_items, and stock_adjustments
-- Version: 1.0
-- Date: 2025-11-07

-- ============================================================================
-- 1. PRODUCTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Product details
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(12, 2) NOT NULL, -- Rupiah: up to Rp 999,999,999.99

  -- Inventory
  stock_quantity INT NOT NULL DEFAULT 0,
  low_stock_threshold INT NOT NULL DEFAULT 5,

  -- Organization
  category VARCHAR(100),
  sku VARCHAR(100), -- Stock Keeping Unit (optional)

  -- Status
  status VARCHAR(50) DEFAULT 'active', -- active, inactive, out_of_stock

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  CONSTRAINT products_price_positive CHECK (price >= 0),
  CONSTRAINT products_stock_non_negative CHECK (stock_quantity >= 0)
);

-- Indexes for products
CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_products_category ON products(tenant_id, category);
CREATE INDEX idx_products_status ON products(tenant_id, status);
CREATE INDEX idx_products_sku ON products(sku) WHERE sku IS NOT NULL;
CREATE INDEX idx_products_name_search ON products USING gin(to_tsvector('simple', name));

-- ============================================================================
-- 2. ORDERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  outlet_id UUID REFERENCES outlets(id) ON DELETE SET NULL,
  conversation_id UUID, -- Will reference conversations table when created

  -- Customer info
  customer_phone VARCHAR(50) NOT NULL,
  customer_name VARCHAR(255),
  customer_address TEXT,

  -- Order identification
  order_number VARCHAR(50) UNIQUE NOT NULL, -- e.g., ORD-20250107-001

  -- Order status workflow
  status VARCHAR(50) DEFAULT 'pending',
  -- pending → confirmed → preparing → ready → completed
  -- Can also go to: cancelled

  -- Pricing (all in Rupiah)
  subtotal DECIMAL(12, 2) NOT NULL,
  delivery_fee DECIMAL(10, 2) DEFAULT 0,
  discount DECIMAL(10, 2) DEFAULT 0,
  total DECIMAL(12, 2) NOT NULL,

  -- Payment tracking
  payment_status VARCHAR(50) DEFAULT 'unpaid', -- unpaid, partially_paid, paid
  amount_paid DECIMAL(12, 2) DEFAULT 0,
  payment_method VARCHAR(50), -- cash, bank_transfer, e-wallet, etc.

  -- Fulfillment
  pickup_delivery_date DATE,
  pickup_delivery_time VARCHAR(20), -- e.g., "14:00" or "2 PM"
  fulfillment_type VARCHAR(50) DEFAULT 'pickup', -- pickup, delivery

  -- Additional info
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,

  -- Constraints
  CONSTRAINT orders_total_positive CHECK (total >= 0),
  CONSTRAINT orders_amount_paid_valid CHECK (amount_paid >= 0 AND amount_paid <= total),
  CONSTRAINT orders_subtotal_positive CHECK (subtotal >= 0)
);

-- Indexes for orders
CREATE INDEX idx_orders_tenant ON orders(tenant_id);
CREATE INDEX idx_orders_status ON orders(tenant_id, status);
CREATE INDEX idx_orders_customer ON orders(customer_phone);
CREATE INDEX idx_orders_date ON orders(pickup_delivery_date);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_number ON orders(order_number);

-- ============================================================================
-- 3. ORDER_ITEMS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT, -- Prevent deleting products with orders

  -- Snapshot product details (frozen at order time)
  product_name VARCHAR(255) NOT NULL,
  product_price DECIMAL(12, 2) NOT NULL,

  -- Order item details
  quantity INT NOT NULL,
  subtotal DECIMAL(12, 2) NOT NULL, -- quantity * product_price
  notes TEXT, -- e.g., "extra chocolate", "no nuts"

  created_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  CONSTRAINT order_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT order_items_subtotal_matches CHECK (subtotal = product_price * quantity)
);

-- Indexes for order_items
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

-- ============================================================================
-- 4. STOCK_ADJUSTMENTS TABLE (Audit Log)
-- ============================================================================
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- Adjustment details
  adjustment_type VARCHAR(50) NOT NULL,
  -- Types: order_created, order_cancelled, manual_add, manual_remove, stock_correction

  quantity_change INT NOT NULL, -- negative for deduction, positive for addition
  previous_quantity INT NOT NULL,
  new_quantity INT NOT NULL,

  -- Related order (if applicable)
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,

  -- Audit info
  reason TEXT,
  adjusted_by UUID REFERENCES users(id) ON DELETE SET NULL, -- for manual adjustments
  adjusted_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for stock_adjustments
CREATE INDEX idx_stock_adjustments_tenant ON stock_adjustments(tenant_id);
CREATE INDEX idx_stock_adjustments_product ON stock_adjustments(product_id);
CREATE INDEX idx_stock_adjustments_date ON stock_adjustments(adjusted_at DESC);
CREATE INDEX idx_stock_adjustments_order ON stock_adjustments(order_id) WHERE order_id IS NOT NULL;

-- ============================================================================
-- 5. CATEGORIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  name VARCHAR(100) NOT NULL,
  description TEXT,
  display_order INT DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(tenant_id, name)
);

-- Indexes for categories
CREATE INDEX idx_categories_tenant ON categories(tenant_id, display_order);

-- ============================================================================
-- SEED DATA FOR POC TESTING
-- ============================================================================

-- Insert sample products for test tenant
INSERT INTO products (tenant_id, name, description, price, stock_quantity, low_stock_threshold, category, sku, status)
VALUES
  -- Tenant 1 products (Cake seller)
  ('00000000-0000-0000-0000-000000000001', 'Chocolate Cake', 'Delicious 20cm chocolate cake with ganache frosting', 150000, 10, 3, 'Cakes', 'CAKE-CHOC-20', 'active'),
  ('00000000-0000-0000-0000-000000000001', 'Red Velvet Cake', 'Classic red velvet with cream cheese frosting', 180000, 5, 3, 'Cakes', 'CAKE-REDV-20', 'active'),
  ('00000000-0000-0000-0000-000000000001', 'Vanilla Cupcakes', 'Pack of 6 vanilla cupcakes with buttercream', 60000, 15, 5, 'Cupcakes', 'CUP-VAN-6', 'active'),
  ('00000000-0000-0000-0000-000000000001', 'Brownie Box', 'Box of 12 fudgy brownies', 80000, 8, 3, 'Desserts', 'BROW-BOX-12', 'active'),
  ('00000000-0000-0000-0000-000000000001', 'Cheese Tart', 'Japanese-style cheese tart (pack of 4)', 45000, 2, 5, 'Tarts', 'TART-CHEESE-4', 'active')
ON CONFLICT DO NOTHING;

-- Insert sample categories
INSERT INTO categories (tenant_id, name, description, display_order)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Cakes', 'Full-size cakes', 1),
  ('00000000-0000-0000-0000-000000000001', 'Cupcakes', 'Cupcake packs', 2),
  ('00000000-0000-0000-0000-000000000001', 'Desserts', 'Brownies, cookies, and other desserts', 3),
  ('00000000-0000-0000-0000-000000000001', 'Tarts', 'Tarts and pastries', 4)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to generate order number
CREATE OR REPLACE FUNCTION generate_order_number(p_tenant_id UUID)
RETURNS VARCHAR(50) AS $$
DECLARE
  order_date VARCHAR(8);
  order_seq INT;
  order_num VARCHAR(50);
BEGIN
  -- Format: ORD-YYYYMMDD-XXX
  order_date := TO_CHAR(NOW(), 'YYYYMMDD');

  -- Get next sequence number for today
  SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 14) AS INT)), 0) + 1
  INTO order_seq
  FROM orders
  WHERE tenant_id = p_tenant_id
    AND order_number LIKE 'ORD-' || order_date || '-%';

  -- Pad sequence to 3 digits
  order_num := 'ORD-' || order_date || '-' || LPAD(order_seq::TEXT, 3, '0');

  RETURN order_num;
END;
$$ LANGUAGE plpgsql;

-- Function to update product updated_at timestamp
CREATE OR REPLACE FUNCTION update_product_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update product timestamp
CREATE TRIGGER trigger_update_product_timestamp
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION update_product_timestamp();

-- Function to update order updated_at timestamp
CREATE OR REPLACE FUNCTION update_order_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update order timestamp
CREATE TRIGGER trigger_update_order_timestamp
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION update_order_timestamp();

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify tables created
DO $$
BEGIN
  RAISE NOTICE 'Order Management tables created successfully!';
  RAISE NOTICE 'Tables: products, orders, order_items, stock_adjustments, categories';
  RAISE NOTICE 'Sample products inserted for tenant 00000000-0000-0000-0000-000000000001';
END $$;
