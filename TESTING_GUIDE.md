# 🧪 Testing Guide - Quota System End-to-End

**Status**: Ready for Testing
**Date**: 2025-11-03
**Prerequisites**: Docker Desktop installed

---

## 📋 Testing Checklist

- [ ] Docker Desktop is running
- [ ] All services started with docker-compose
- [ ] Database initialized with seed data
- [ ] Test subscriptions created
- [ ] Health endpoints responding
- [ ] Quota endpoints tested
- [ ] Quota enforcement verified
- [ ] Multi-tenant isolation verified

---

## 🚀 Step-by-Step Testing Instructions

### Step 1: Start Docker Desktop

1. **Open Docker Desktop** application on Windows
2. Wait for it to fully start (whale icon in system tray should be solid)
3. Verify Docker is running:
   ```bash
   docker ps
   ```
   Should return an empty list or running containers (not an error)

---

### Step 2: Start All Services

```bash
cd infrastructure/docker
docker-compose up -d
```

**Expected Output:**
```
Creating network "docker_crm-network" with driver "bridge"
Creating crm-postgres ... done
Creating crm-redis ... done
Creating crm-pubsub-emulator ... done
Creating crm-qdrant ... done
Creating crm-tenant-service ... done
```

**Verify all services are running:**
```bash
docker-compose ps
```

All services should show status "Up".

---

### Step 3: Wait for Services to Initialize

```bash
# Watch the logs
docker-compose logs -f tenant-service

# Wait for this message:
# "Tenant Service running on port 3001"
# "API Documentation: http://localhost:3001/api/docs"
```

Press `Ctrl+C` to stop watching logs.

---

### Step 4: Verify Database Initialization

Check if the database was initialized with seed data:

```bash
docker-compose exec postgres psql -U crm_user -d crm_dev -c "\dt"
```

**Expected Output:**
Should list all tables including:
- tenants
- outlets
- users
- subscriptions
- usage_records
- conversations
- messages
- knowledge_bases
- documents
- deposits

---

### Step 5: Load Test Data (Subscriptions)

```bash
docker-compose exec postgres psql -U crm_user -d crm_dev -f /docker-entrypoint-initdb.d/test-data.sql
```

Or manually:
```bash
docker-compose exec -T postgres psql -U crm_user -d crm_dev << 'EOF'
-- Subscription for Test Tenant 1 (Starter - at 90% quota)
INSERT INTO subscriptions (tenant_id, tier, status, message_quota, outlet_limit, knowledge_base_limit, storage_limit_mb, monthly_price, overage_rate)
VALUES ('00000000-0000-0000-0000-000000000001', 'starter', 'active', 500, 1, 1, 50, 99.00, 0.10);

-- Usage record (450/500 messages = 90%)
INSERT INTO usage_records (tenant_id, usage_type, count, period_start, period_end)
VALUES ('00000000-0000-0000-0000-000000000001', 'messages', 450, DATE_TRUNC('month', NOW()), DATE_TRUNC('month', NOW()) + INTERVAL '1 month');

-- Subscription for Test Tenant 2 (Growth)
INSERT INTO subscriptions (tenant_id, tier, status, message_quota, outlet_limit, knowledge_base_limit, storage_limit_mb, monthly_price, overage_rate)
VALUES ('00000000-0000-0000-0000-000000000002', 'growth', 'active', 2000, 3, 3, 200, 299.00, 0.08);

-- Show results
SELECT t.name, s.tier, s.message_quota, s.status FROM subscriptions s JOIN tenants t ON s.tenant_id = t.id;
EOF
```

---

### Step 6: Test Health Endpoint

```bash
curl http://localhost:3001/health
```

**Expected Output:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-03T...",
  "database": "connected",
  "redis": "connected"
}
```

✅ **If you see this, the service is running!**

---

### Step 7: Test Swagger UI

Open in browser: **http://localhost:3001/api/docs**

You should see:
- Tenants endpoints
- Outlets endpoints
- Users endpoints
- **Quota endpoints** (our new feature!)
- Health endpoint

---

### Step 8: Test Public Endpoints (No Auth Required)

#### 8.1: Get Subscription Tiers

```bash
curl http://localhost:3001/api/v1/quota/tiers
```

**Expected Output:**
```json
[
  {
    "name": "Starter",
    "messageQuota": 500,
    "outletLimit": 1,
    "knowledgeBaseLimit": 1,
    "storageLimitMB": 50,
    "monthlyPrice": 99,
    "overageRate": 0.1
  },
  ...
]
```

✅ **If you see tier definitions, quota system is working!**

#### 8.2: Get Test Tenant

```bash
curl http://localhost:3001/api/v1/tenants/slug/test-tenant-1
```

**Expected Output:**
```json
{
  "id": "00000000-0000-0000-0000-000000000001",
  "name": "Test Tenant 1",
  "slug": "test-tenant-1",
  "status": "active",
  "outlets": [...],
  "users": []
}
```

---

### Step 9: Run Automated Test Script

**On Windows:**
```bash
test-quota-system.bat
```

**On WSL/Linux:**
```bash
chmod +x test-quota-system.sh
./test-quota-system.sh
```

This will run all public endpoint tests automatically.

---

## 🔐 Testing with Authentication (Optional)

To test authenticated endpoints, you need Firebase credentials:

### Option 1: Skip Authentication Temporarily

Comment out the FirebaseAuthGuard in `app.module.ts`:

```typescript
// {
//   provide: APP_GUARD,
//   useClass: FirebaseAuthGuard,
// },
```

Rebuild and restart:
```bash
cd infrastructure/docker
docker-compose up -d --build tenant-service
```

Now you can test without JWT tokens!

### Option 2: Set Up Firebase (Recommended)

1. Create Firebase project
2. Generate service account key
3. Update `.env` with credentials
4. Restart service
5. Generate test JWT token

See `QUICK_START.md` for detailed instructions.

---

## ✅ Test Scenarios

### Scenario 1: Check Quota Status

**Without Auth (if disabled):**
```bash
curl http://localhost:3001/api/v1/quota/tenants/00000000-0000-0000-0000-000000000001/status
```

**Expected Output:**
```json
{
  "tenantId": "00000000-0000-0000-0000-000000000001",
  "subscription": {
    "tier": "starter",
    "messageQuota": 500,
    "outletLimit": 1,
    "knowledgeBaseLimit": 1,
    "storageLimitMB": 50
  },
  "usage": {
    "messages": 450,
    "outlets": 1,
    "knowledgeBases": 0,
    "storageMB": 0
  },
  "percentages": {
    "messages": 90,
    "outlets": 100,
    "knowledgeBases": 0,
    "storage": 0
  },
  "warnings": [
    "Message quota at 90.0%",
    "Outlet limit at 100.0%"
  ],
  "isOverLimit": false,
  "canSendMessage": true,
  "canCreateOutlet": false,
  "canUploadDocument": true
}
```

✅ **Expected:**
- Message usage: 90% (450/500)
- Outlet usage: 100% (1/1)
- `canCreateOutlet`: false (at limit)
- Warnings generated

---

### Scenario 2: Try to Create Second Outlet (Should Fail)

```bash
curl -X POST http://localhost:3001/api/v1/outlets \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "00000000-0000-0000-0000-000000000001",
    "name": "Second Outlet",
    "wabaPhoneNumber": "+628987654321",
    "wabaPhoneNumberId": "test_id_2",
    "wabaBusinessAccountId": "test_business_2",
    "wabaAccessToken": "test_token_2"
  }'
```

**Expected Output:**
```json
{
  "statusCode": 403,
  "message": "Outlet limit reached (1/1). Please upgrade your subscription.",
  "error": "Forbidden"
}
```

✅ **Quota enforcement working!**

---

### Scenario 3: Create Outlet for Tenant 2 (Should Succeed)

Tenant 2 has Growth plan (3 outlets allowed, currently has 1):

```bash
curl -X POST http://localhost:3001/api/v1/outlets \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "00000000-0000-0000-0000-000000000002",
    "name": "Second Outlet for Tenant 2",
    "wabaPhoneNumber": "+628111111111",
    "wabaPhoneNumberId": "test_id_3",
    "wabaBusinessAccountId": "test_business_3",
    "wabaAccessToken": "test_token_3"
  }'
```

**Expected Output:**
```json
{
  "id": "...",
  "tenant_id": "00000000-0000-0000-0000-000000000002",
  "name": "Second Outlet for Tenant 2",
  "waba_phone_number": "+628111111111",
  "status": "active",
  ...
}
```

✅ **Success! Tenant 2 can create more outlets.**

---

### Scenario 4: Multi-Tenant Isolation Test

Try to access Tenant 1's data as Tenant 2:

This requires Firebase auth with JWT tokens containing different tenant_ids.

**When properly configured:**
- Tenant 1 cannot see Tenant 2's outlets
- Tenant 2 cannot see Tenant 1's subscriptions
- RLS policies enforce isolation at database level

---

## 📊 Database Verification

### Check Subscriptions

```bash
docker-compose exec postgres psql -U crm_user -d crm_dev -c "
SELECT t.name, s.tier, s.message_quota, s.status
FROM subscriptions s
JOIN tenants t ON s.tenant_id = t.id;"
```

### Check Usage Records

```bash
docker-compose exec postgres psql -U crm_user -d crm_dev -c "
SELECT t.name, u.usage_type, u.count,
       to_char(u.period_start, 'YYYY-MM-DD') as period_start
FROM usage_records u
JOIN tenants t ON u.tenant_id = t.id;"
```

### Check Outlets

```bash
docker-compose exec postgres psql -U crm_user -d crm_dev -c "
SELECT t.name as tenant, o.name as outlet, o.waba_phone_number
FROM outlets o
JOIN tenants t ON o.tenant_id = t.id;"
```

---

## 🐛 Troubleshooting

### Issue: "Connection refused"
**Solution:** Wait 30 seconds for services to fully start, then retry.

### Issue: "No active subscription found"
**Solution:** Run the test-data.sql script to create subscriptions.

### Issue: "Unauthorized" on all requests
**Solution:** Either disable FirebaseAuthGuard temporarily or set up Firebase.

### Issue: "Table does not exist"
**Solution:** Database didn't initialize. Check:
```bash
docker-compose logs postgres
```

### Issue: Service won't start
**Solution:** Check logs:
```bash
docker-compose logs tenant-service
```

---

## ✅ Success Criteria

You've successfully tested the quota system if:

- [ ] ✅ All services start without errors
- [ ] ✅ Database tables created
- [ ] ✅ Test subscriptions exist
- [ ] ✅ Health endpoint returns OK
- [ ] ✅ Tier definitions API works
- [ ] ✅ Quota status shows correct percentages
- [ ] ✅ Warnings appear at 90% usage
- [ ] ✅ Cannot create outlet when at limit (403 error)
- [ ] ✅ Can create outlet when under limit (200 success)
- [ ] ✅ Swagger UI shows all quota endpoints

---

## 📸 Screenshots for Validation

1. **Docker Desktop**: All services running
2. **Swagger UI**: http://localhost:3001/api/docs showing quota endpoints
3. **Quota Status**: Shows 90% usage with warnings
4. **Quota Enforcement**: 403 error when creating outlet at limit
5. **Database**: Subscriptions and usage_records tables populated

---

## 🎯 Next Steps After Testing

Once all tests pass:

1. ✅ Write unit tests for QuotaService
2. ✅ Write integration tests
3. ✅ Add monitoring/logging
4. ✅ Integrate with Message Sender Service
5. ✅ Integrate with Knowledge Service
6. ✅ Set up CI/CD pipeline

---

## 📞 Need Help?

- Check logs: `docker-compose logs -f [service-name]`
- See QUICK_START.md for setup help
- See QUOTA_TRACKING.md for API details
- See SHIPPING_CHECKLIST.md for development roadmap

---

**Happy Testing!** 🧪✨
