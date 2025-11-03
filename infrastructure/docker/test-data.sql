-- Test Data Setup for Quota Testing
-- Run this after the database is initialized

-- This script adds subscriptions for the test tenants

\echo '=========================================='
\echo 'Setting up test subscriptions...'
\echo '=========================================='

-- Subscription for Test Tenant 1 (Starter Plan)
INSERT INTO subscriptions (
  tenant_id,
  tier,
  status,
  message_quota,
  outlet_limit,
  knowledge_base_limit,
  storage_limit_mb,
  monthly_price,
  overage_rate
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'starter',
  'active',
  500,
  1,
  1,
  50,
  99.00,
  0.10
) ON CONFLICT DO NOTHING;

-- Subscription for Test Tenant 2 (Growth Plan)
INSERT INTO subscriptions (
  tenant_id,
  tier,
  status,
  message_quota,
  outlet_limit,
  knowledge_base_limit,
  storage_limit_mb,
  monthly_price,
  overage_rate
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  'growth',
  'active',
  2000,
  3,
  3,
  200,
  299.00,
  0.08
) ON CONFLICT DO NOTHING;

-- Add some test usage for Tenant 1 (90% of quota to trigger warnings)
INSERT INTO usage_records (
  tenant_id,
  usage_type,
  count,
  period_start,
  period_end
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'messages',
  450,  -- 90% of 500 message quota
  DATE_TRUNC('month', NOW()),
  DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
) ON CONFLICT (tenant_id, usage_type, period_start, period_end)
  DO UPDATE SET count = 450;

-- Add some test usage for Tenant 2 (50% of quota - normal usage)
INSERT INTO usage_records (
  tenant_id,
  usage_type,
  count,
  period_start,
  period_end
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  'messages',
  1000,  -- 50% of 2000 message quota
  DATE_TRUNC('month', NOW()),
  DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
) ON CONFLICT (tenant_id, usage_type, period_start, period_end)
  DO UPDATE SET count = 1000;

\echo 'Test subscriptions created!'
\echo ''

-- Show the test data
\echo 'Test Tenants:'
SELECT id, name, slug, status FROM tenants ORDER BY created_at;

\echo ''
\echo 'Test Subscriptions:'
SELECT
  t.name as tenant_name,
  s.tier,
  s.message_quota,
  s.outlet_limit,
  s.status
FROM subscriptions s
JOIN tenants t ON s.tenant_id = t.id
ORDER BY t.created_at;

\echo ''
\echo 'Test Usage Records:'
SELECT
  t.name as tenant_name,
  u.usage_type,
  u.count,
  to_char(u.period_start, 'YYYY-MM-DD') as period_start
FROM usage_records u
JOIN tenants t ON u.tenant_id = t.id
ORDER BY t.created_at, u.usage_type;

\echo ''
\echo '=========================================='
\echo '✅ Test data setup complete!'
\echo '=========================================='
