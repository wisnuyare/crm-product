# Security TODOs for Tenant Service

## ✅ RESOLVED: Multi-Tenant Isolation Fixed

**Date Resolved**: 2025-11-03
**Status**: All services updated with explicit WHERE clauses
**Tested**: Multi-tenant isolation verified - tenants can only access their own data

###  Problem
Row Level Security (RLS) policies are enabled, but they're not filtering data correctly because:
1. `SET app.current_tenant_id` doesn't persist with connection pooling
2. Each query gets a different connection from the pool without the session variable

### Current Status
- ✅ RLS policies created for all tables
- ✅ FORCE RLS enabled (applies to table owners)
- ❌ Session variables not persisting across pooled connections

### Solution Required
Add explicit `WHERE tenant_id = $tenantId` to ALL queries in services:

#### OutletsService
```typescript
async findAll(tenantId: string): Promise<Outlet[]> {
  return await this.db.queryMany<Outlet>(
    'SELECT * FROM outlets WHERE tenant_id = $1 ORDER BY created_at DESC',
    [tenantId]
  );
}
```

#### TenantsService
Already filtering correctly through auth context.

#### UsersService
```typescript
async findAll(tenantId: string): Promise<User[]> {
  return await this.db.queryMany<User>(
    'SELECT * FROM users WHERE tenant_id = $1 ORDER BY created_at DESC',
    [tenantId]
  );
}
```

### Alternative: Transaction-Scoped Session Variables
Use `SET LOCAL` within transactions:
```typescript
async query(sql: string, params: any[], tenantId?: string) {
  const client = await this.pool.connect();
  try {
    await client.query('BEGIN');
    if (tenantId) {
      await client.query('SET LOCAL app.current_tenant_id = $1', [tenantId]);
    }
    const result = await client.query(sql, params);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
```

### Defense in Depth Strategy
1. **Primary**: Explicit WHERE clauses (application level)
2. **Backup**: RLS policies (database level)
3. **Monitoring**: Audit logs for cross-tenant access attempts

### Priority
**P0 - CRITICAL** - Must be fixed before production deployment
