# Firebase Auth Quick Reference

## Controller Examples

### 1. Public Route (No Auth)

```typescript
import { Controller, Get } from '@nestjs/common';
import { Public } from '../../firebase/decorators';

@Controller('public')
export class PublicController {
  @Get('info')
  @Public()  // Anyone can access
  getInfo() {
    return { message: 'This is public' };
  }
}
```

### 2. Protected Route (Auth Required)

```typescript
import { Controller, Get } from '@nestjs/common';

@Controller('protected')
export class ProtectedController {
  @Get('data')
  // No @Public() = Auth required
  getData() {
    return { message: 'You are authenticated!' };
  }
}
```

### 3. Admin Only

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { Roles } from '../../firebase/decorators';

@Controller('admin')
export class AdminController {
  @Post('settings')
  @Roles('admin')  // Only users with role='admin'
  updateSettings(@Body() data: any) {
    return { message: 'Settings updated by admin' };
  }
}
```

### 4. Multiple Roles

```typescript
import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../firebase/decorators';

@Controller('dashboard')
export class DashboardController {
  @Get('stats')
  @Roles('admin', 'agent')  // Admins OR agents
  getStats() {
    return { stats: 'Data visible to admins and agents' };
  }
}
```

### 5. Get Current User

```typescript
import { Controller, Get } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../firebase/decorators';

@Controller('profile')
export class ProfileController {
  @Get('me')
  getProfile(@CurrentUser() user: RequestUser) {
    return {
      uid: user.uid,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role
    };
  }
}
```

### 6. Get Tenant ID

```typescript
import { Controller, Get } from '@nestjs/common';
import { TenantId } from '../../firebase/decorators';

@Controller('my-data')
export class MyDataController {
  @Get('outlets')
  getMyOutlets(@TenantId() tenantId: string) {
    // tenantId extracted from JWT token
    return this.outletsService.findByTenant(tenantId);
  }
}
```

### 7. Complete Example

```typescript
import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { Roles, CurrentUser, TenantId, RequestUser } from '../../firebase/decorators';

@Controller('tenants')
export class TenantsController {
  constructor(private tenantsService: TenantsService) {}

  // Anyone authenticated can list tenants
  @Get()
  async findAll(@CurrentUser() user: RequestUser) {
    console.log(`${user.email} is listing tenants`);
    return this.tenantsService.findAll();
  }

  // Only admins can create tenants
  @Post()
  @Roles('admin')
  async create(
    @Body() dto: CreateTenantDto,
    @CurrentUser() user: RequestUser
  ) {
    console.log(`Admin ${user.email} creating tenant`);
    return this.tenantsService.create(dto);
  }

  // Admins and agents can view specific tenant
  @Get(':id')
  @Roles('admin', 'agent')
  async findOne(
    @Param('id') id: string,
    @TenantId() currentTenantId: string
  ) {
    // Optionally check if user can access this tenant
    if (id !== currentTenantId) {
      throw new ForbiddenException('Cannot access other tenants');
    }
    return this.tenantsService.findOne(id);
  }

  // Only admins can update
  @Put(':id')
  @Roles('admin')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto
  ) {
    return this.tenantsService.update(id, dto);
  }

  // Only admins can delete
  @Delete(':id')
  @Roles('admin')
  async remove(@Param('id') id: string) {
    await this.tenantsService.remove(id);
    return { message: 'Tenant deleted' };
  }
}
```

---

## Testing with cURL

### 1. Get Firebase Token

```bash
# Sign in with email/password
curl -X POST \
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=YOUR_WEB_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "returnSecureToken": true
  }'

# Response contains:
# {
#   "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6...",
#   "email": "user@example.com",
#   "refreshToken": "...",
#   "expiresIn": "3600"
# }
```

### 2. Make Authenticated Request

```bash
# Store token
TOKEN="eyJhbGciOiJSUzI1NiIsImtpZCI6..."

# Call protected endpoint
curl http://localhost:3001/api/v1/tenants \
  -H "Authorization: Bearer $TOKEN"
```

### 3. Call Public Endpoint

```bash
# No token needed
curl http://localhost:3001/health
```

---

## Setting Custom Claims (Server-Side)

```typescript
import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';

@Injectable()
export class OnboardingService {
  constructor(private firebaseService: FirebaseService) {}

  async setupUserForTenant(firebaseUid: string, tenantId: string, role: string) {
    // Set custom claims on Firebase user
    await this.firebaseService.setCustomClaims(firebaseUid, {
      tenant_id: tenantId,
      role: role  // 'admin', 'agent', or 'viewer'
    });

    // User must sign in again to get new token with claims
    return { message: 'User setup complete. Please sign in again.' };
  }
}
```

---

## Request User Interface

```typescript
export interface RequestUser {
  uid: string;           // Firebase user ID
  email: string;         // User email
  tenantId: string;      // From custom claims
  role: string;          // From custom claims: 'admin', 'agent', 'viewer'
  firebaseToken: any;    // Full decoded token
}
```

---

## Error Responses

### No Token Provided

```bash
curl http://localhost:3001/api/v1/tenants

# Response: 401 Unauthorized
{
  "statusCode": 401,
  "message": "No authentication token provided"
}
```

### Invalid Token

```bash
curl http://localhost:3001/api/v1/tenants \
  -H "Authorization: Bearer invalid-token"

# Response: 401 Unauthorized
{
  "statusCode": 401,
  "message": "Invalid or expired token"
}
```

### Insufficient Role

```bash
curl http://localhost:3001/api/v1/tenants \
  -H "Authorization: Bearer <viewer-token>"

# Response: 403 Forbidden (if endpoint requires admin)
{
  "statusCode": 403,
  "message": "Insufficient permissions. Required roles: admin"
}
```

---

## Decorator Summary

| Decorator | Purpose | Example |
|-----------|---------|---------|
| `@Public()` | Skip authentication | `@Public()` |
| `@Roles(...roles)` | Require specific roles | `@Roles('admin', 'agent')` |
| `@CurrentUser()` | Get current user object | `@CurrentUser() user: RequestUser` |
| `@TenantId()` | Get tenant ID from token | `@TenantId() tenantId: string` |

---

## Development Workflow

1. **User signs up** → Firebase creates user account
2. **Admin assigns tenant** → Call `setCustomClaims()` with `tenant_id` and `role`
3. **User signs in again** → Gets new token with custom claims
4. **User makes requests** → Token automatically verified by guard
5. **Guards check roles** → Endpoint access granted/denied based on role

---

## Production Checklist

- [ ] Set Firebase credentials in environment variables
- [ ] Ensure `FIREBASE_PRIVATE_KEY` has proper newlines (`\n`)
- [ ] Implement user onboarding flow with custom claims
- [ ] Set up token refresh mechanism on client
- [ ] Add rate limiting per tenant
- [ ] Implement audit logging for admin actions
- [ ] Test all role combinations
- [ ] Document API authentication requirements

---

**Need Help?**
- Firebase Auth Docs: https://firebase.google.com/docs/auth
- Firebase Admin SDK: https://firebase.google.com/docs/admin/setup
- Custom Claims: https://firebase.google.com/docs/auth/admin/custom-claims
