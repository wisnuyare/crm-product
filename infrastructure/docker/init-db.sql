-- WhatsApp CRM Multi-Tenant Database Schema
-- This script initializes the database with all required tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- TENANT MANAGEMENT
-- ============================================================================

-- Tenants table
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'active',
  llm_tone JSONB DEFAULT '{"tone": "professional"}',
  contact_email VARCHAR(255),
  firebase_tenant_id VARCHAR(255),
  CONSTRAINT valid_status CHECK (status IN ('active', 'suspended', 'inactive'))
);

-- Outlets table (1:many with tenant)
CREATE TABLE outlets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  waba_phone_number VARCHAR(50) UNIQUE NOT NULL,
  waba_phone_number_id VARCHAR(255) NOT NULL,
  waba_business_account_id VARCHAR(255) NOT NULL,
  waba_access_token TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'active',
  CONSTRAINT valid_outlet_status CHECK (status IN ('active', 'inactive'))
);

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  firebase_uid VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'agent',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, email),
  CONSTRAINT valid_role CHECK (role IN ('admin', 'agent', 'viewer'))
);

-- ============================================================================
-- BILLING MANAGEMENT
-- ============================================================================

-- Subscriptions table
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  tier VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  message_quota INTEGER NOT NULL,
  outlet_limit INTEGER NOT NULL,
  knowledge_base_limit INTEGER,
  storage_limit_mb INTEGER NOT NULL,
  monthly_price DECIMAL(10, 2) NOT NULL,
  overage_rate DECIMAL(10, 4) NOT NULL,
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT valid_tier CHECK (tier IN ('starter', 'growth', 'enterprise')),
  CONSTRAINT valid_subscription_status CHECK (status IN ('active', 'cancelled', 'expired'))
);

-- Usage tracking table
CREATE TABLE usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  usage_type VARCHAR(50) NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT valid_usage_type CHECK (usage_type IN ('messages', 'api_calls', 'storage_mb'))
);

-- Deposit management
CREATE TABLE deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  balance DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- KNOWLEDGE BASE
-- ============================================================================

-- Knowledge bases table
CREATE TABLE knowledge_bases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  outlet_id UUID REFERENCES outlets(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'active',
  CONSTRAINT valid_kb_status CHECK (status IN ('active', 'inactive'))
);

-- Documents table
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_base_id UUID REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  file_type VARCHAR(50) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  processing_status VARCHAR(50) DEFAULT 'pending',
  chunk_count INTEGER DEFAULT 0,
  uploaded_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  CONSTRAINT valid_file_type CHECK (file_type IN ('pdf', 'docx', 'xlsx', 'txt')),
  CONSTRAINT valid_processing_status CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed'))
);

-- ============================================================================
-- CONVERSATIONS
-- ============================================================================

-- Conversations table
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  outlet_id UUID REFERENCES outlets(id) ON DELETE CASCADE,
  customer_phone VARCHAR(50) NOT NULL,
  customer_name VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active',
  handoff_requested BOOLEAN DEFAULT FALSE,
  handoff_agent_id UUID REFERENCES users(id),
  handoff_reason TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  last_message_at TIMESTAMP,
  CONSTRAINT valid_conversation_status CHECK (status IN ('active', 'resolved', 'handed_off', 'expired'))
);

-- Messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_type VARCHAR(50) NOT NULL,
  sender_id VARCHAR(255),
  content TEXT NOT NULL,
  whatsapp_message_id VARCHAR(255),
  timestamp TIMESTAMP DEFAULT NOW(),
  metadata JSONB,
  CONSTRAINT valid_sender_type CHECK (sender_type IN ('customer', 'llm', 'agent'))
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Tenant Service indexes
CREATE INDEX idx_outlets_tenant ON outlets(tenant_id);
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_firebase ON users(firebase_uid);

-- Billing Service indexes
CREATE INDEX idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX idx_usage_records_tenant_period ON usage_records(tenant_id, period_start, period_end);
CREATE INDEX idx_deposits_tenant ON deposits(tenant_id);

-- Knowledge Service indexes
CREATE INDEX idx_knowledge_bases_tenant ON knowledge_bases(tenant_id);
CREATE INDEX idx_knowledge_bases_outlet ON knowledge_bases(outlet_id);
CREATE INDEX idx_documents_kb ON documents(knowledge_base_id);
CREATE INDEX idx_documents_tenant ON documents(tenant_id);

-- Conversation Service indexes
CREATE INDEX idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX idx_conversations_outlet ON conversations(outlet_id);
CREATE INDEX idx_conversations_customer ON conversations(customer_phone);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, timestamp DESC);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);

-- ============================================================================
-- ROW-LEVEL SECURITY (Multi-tenant Isolation)
-- ============================================================================

-- Enable RLS on all tenant-scoped tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (to be activated when app.current_tenant_id is set)
CREATE POLICY tenant_isolation ON tenants
  USING (id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON outlets
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON users
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON subscriptions
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON usage_records
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON deposits
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON knowledge_bases
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON documents
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON conversations
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON messages
  USING (conversation_id IN (
    SELECT id FROM conversations WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid
  ));

-- ============================================================================
-- SEED DATA (For Development)
-- ============================================================================

-- Insert test tenant
INSERT INTO tenants (id, name, slug, contact_email, status) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Test Tenant 1', 'test-tenant-1', 'admin@test1.com', 'active'),
  ('00000000-0000-0000-0000-000000000002', 'Test Tenant 2', 'test-tenant-2', 'admin@test2.com', 'active');

-- Insert test outlets
INSERT INTO outlets (tenant_id, name, waba_phone_number, waba_phone_number_id, waba_business_account_id, waba_access_token) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Main Store', '+628123456789', 'test_phone_id_1', 'test_business_id_1', 'test_token_1'),
  ('00000000-0000-0000-0000-000000000002', 'Downtown Branch', '+628987654321', 'test_phone_id_2', 'test_business_id_2', 'test_token_2');

-- Insert test subscriptions
INSERT INTO subscriptions (tenant_id, tier, message_quota, outlet_limit, knowledge_base_limit, storage_limit_mb, monthly_price, overage_rate) VALUES
  ('00000000-0000-0000-0000-000000000001', 'starter', 500, 1, 1, 50, 99.00, 0.10),
  ('00000000-0000-0000-0000-000000000002', 'growth', 2000, 3, 3, 200, 299.00, 0.08);

COMMIT;
