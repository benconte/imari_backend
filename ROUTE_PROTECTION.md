# Route Protection & Authentication Guide

## Overview

The Imari API uses JWT-based authentication with the following model:

- **Public Routes**: No authentication required
- **Protected Routes**: Require valid JWT access token in `Authorization: Bearer <token>` header
- **Auth Guard**: `JwtAuthGuard` validates token validity, session status, and user account status

---

## Route Protection Summary

### 🟢 Public Routes (No Authentication Required)

#### Health & System
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Root info (API name, status) |
| `GET` | `/health` | Liveness probe (DB readiness check) |

#### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/register` | Create new user account |
| `POST` | `/auth/verify-email` | Verify email with OTP |
| `POST` | `/auth/login` | Login with credentials |
| `POST` | `/auth/refresh` | Refresh access token |
| `POST` | `/auth/forgot-password` | Request password reset OTP |
| `POST` | `/auth/reset-password` | Reset password with OTP |

---

### 🔴 Protected Routes (JWT Required)

#### Logout
| Method | Endpoint | Protection | Description |
|--------|----------|-----------|-------------|
| `POST` | `/auth/logout` | `@ApiBearerAuth()` | Revoke current session |

#### Identity Management
| Method | Endpoint | Protection | Description |
|--------|----------|-----------|-------------|
| `GET` | `/identity/profile` | `@UseGuards(JwtAuthGuard)` `@ApiBearerAuth()` | Get user profile |
| `PATCH` | `/identity/profile` | `@UseGuards(JwtAuthGuard)` `@ApiBearerAuth()` | Update user profile |
| `GET` | `/identity/devices` | `@UseGuards(JwtAuthGuard)` `@ApiBearerAuth()` | List user devices |
| `POST` | `/identity/devices` | `@UseGuards(JwtAuthGuard)` `@ApiBearerAuth()` | Register new device |
| `PATCH` | `/identity/devices/:deviceId/trust` | `@UseGuards(JwtAuthGuard)` `@ApiBearerAuth()` | Mark device as trusted |
| `DELETE` | `/identity/devices/:deviceId` | `@UseGuards(JwtAuthGuard)` `@ApiBearerAuth()` | Remove device |
| `POST` | `/identity/kyc` | `@UseGuards(JwtAuthGuard)` `@ApiBearerAuth()` | Submit KYC document |

#### Multi-Factor Authentication (MFA)
| Method | Endpoint | Protection | Description |
|--------|----------|-----------|-------------|
| `POST` | `/mfa/enable` | `@UseGuards(JwtAuthGuard)` `@ApiBearerAuth()` | Initialize MFA setup |
| `POST` | `/mfa/confirm` | `@UseGuards(JwtAuthGuard)` `@ApiBearerAuth()` | Confirm MFA with TOTP code |
| `GET` | `/mfa/backup-codes` | `@UseGuards(JwtAuthGuard)` `@ApiBearerAuth()` | Get backup codes status |
| `DELETE` | `/mfa/disable` | `@UseGuards(JwtAuthGuard)` `@ApiBearerAuth()` | Disable MFA |

---

## How Authentication Works

### 1. Obtain Access Token

**Register and Login Flow**:
```
1. POST /auth/register → User created (status: PENDING)
2. POST /auth/verify-email → User activated (status: ACTIVE)
3. POST /auth/login → Returns accessToken + refreshToken
```

**Example Login Response**:
```json
{
  "statusCode": 200,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
    "user": { ... }
  }
}
```

### 2. Use Access Token on Protected Routes

**Header Format**:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Example Request**:
```bash
curl -X GET http://localhost:3000/api/v1/identity/profile \
  -H "Authorization: Bearer <accessToken>"
```

### 3. Refresh Expired Token

**Access tokens expire in 15 minutes**. Use refresh token to get a new one:

```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<refreshToken>"}'
```

**Response**:
```json
{
  "statusCode": 200,
  "data": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "z9y8x7..."
  }
}
```

### 4. Logout

**Revoke the current session**:

```bash
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -H "Authorization: Bearer <accessToken>"
```

---

## JWT Token Structure

### Access Token Payload
```json
{
  "sub": "user-uuid",           // User ID
  "jti": "session-jti",         // Session JWT ID (for revocation)
  "type": "access",             // Token type
  "iat": 1716661640,            // Issued at
  "exp": 1716662540             // Expires in 15 minutes
}
```

### Token Validation Process

1. **Signature Verification**: JWT signature verified with `JWT_ACCESS_SECRET`
2. **Expiration Check**: Token not expired
3. **Session Lookup**: JTI found in database and status is ACTIVE
4. **User Status Check**: User account is ACTIVE
5. **Extract User Info**: `userId` and `sessionId` extracted for `@CurrentUser()` decorator

---

## Authentication Guard Details

### JwtAuthGuard (`src/modules/auth/guards/jwt-auth.guard.ts`)

The guard is applied at the **controller level** using:

```typescript
@Controller('identity')
@UseGuards(JwtAuthGuard)  // Applied to ALL routes in this controller
export class IdentityController { ... }
```

### Public Decorator (`@Public()`)

Override the guard on specific routes:

```typescript
@Controller('auth')
@UseGuards(JwtAuthGuard)  // Applied to all routes
export class AuthController {
  @Public()  // Override: this route is PUBLIC
  @Post('register')
  register(dto: RegisterDto) { ... }

  @Post('logout')  // Protected (no @Public decorator)
  logout(user: AuthUser) { ... }
}
```

### Extract User from Request

Use `@CurrentUser()` decorator to get authenticated user:

```typescript
@Get('profile')
getProfile(@CurrentUser() user: AuthUser) {
  // user.userId - authenticated user ID
  // user.sessionId - current session ID
  // user.jti - JWT ID for this session
  return this.identityService.getProfile(user.userId);
}
```

---

## Error Responses for Protected Routes

### Missing Token
```bash
curl http://localhost:3000/api/v1/identity/profile
```

**Response** (401):
```json
{
  "statusCode": 401,
  "error": {
    "message": "Unauthorized"
  }
}
```

### Invalid Token
```bash
curl -H "Authorization: Bearer invalid-token" \
  http://localhost:3000/api/v1/identity/profile
```

**Response** (401):
```json
{
  "statusCode": 401,
  "error": {
    "message": "Unauthorized"
  }
}
```

### Expired Token
```bash
curl -H "Authorization: Bearer <expiredToken>" \
  http://localhost:3000/api/v1/identity/profile
```

**Response** (401):
```json
{
  "statusCode": 401,
  "error": {
    "message": "Unauthorized - Token expired"
  }
}
```

### Session Revoked
After logout, the JTI is marked as REVOKED:

```bash
curl -H "Authorization: Bearer <accessToken>" \
  http://localhost:3000/api/v1/identity/profile
```

**Response** (401):
```json
{
  "statusCode": 401,
  "error": {
    "message": "Unauthorized - Session revoked"
  }
}
```

---

## Frontend Implementation Examples

### JavaScript/TypeScript with Fetch

```typescript
// 1. Login to get tokens
const loginResponse = await fetch('/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});

const { data } = await loginResponse.json();
const { accessToken, refreshToken } = data;

// 2. Store tokens (securely)
sessionStorage.setItem('accessToken', accessToken);  // Session scope
document.cookie = `refreshToken=${refreshToken}; httpOnly; secure; sameSite=Strict`;

// 3. Make authenticated request
const profileResponse = await fetch('/api/v1/identity/profile', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

// 4. Handle token expiration
if (profileResponse.status === 401) {
  // Token expired, refresh it
  const refreshResponse = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });

  const { data: newTokens } = await refreshResponse.json();
  sessionStorage.setItem('accessToken', newTokens.accessToken);

  // Retry original request with new token
  return fetch('/api/v1/identity/profile', {
    headers: { 'Authorization': `Bearer ${newTokens.accessToken}` }
  });
}

// 5. Logout
await fetch('/api/v1/auth/logout', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${accessToken}` }
});

sessionStorage.removeItem('accessToken');
```

### React Hook (useAuth)

```typescript
export function useAuth() {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);

  const login = async (email, password) => {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const { data } = await res.json();
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data;
  };

  const logout = async () => {
    await fetch('/api/v1/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    setAccessToken(null);
    setUser(null);
  };

  const fetchAuthorized = async (url, options = {}) => {
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${accessToken}`
      }
    });
  };

  return { user, login, logout, fetchAuthorized };
}
```

---

## Testing Protected Endpoints

### Using Swagger UI

1. Navigate to http://localhost:3000/api/v1/docs
2. Click **Authorize** button
3. Enter access token: `Bearer <accessToken>`
4. Test endpoints directly

### Using cURL

```bash
# Get token first
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"Pass@123"}' \
  | jq -r '.data.accessToken')

# Use token on protected route
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/identity/profile
```

### Using Postman

1. Login to get access token
2. In **Authorization** tab, select **Bearer Token**
3. Enter the access token value
4. Send requests to protected endpoints

---

## Adding New Protected Routes

### Step 1: Apply JwtAuthGuard at Controller Level

```typescript
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';

@Controller('myfeature')
@UseGuards(JwtAuthGuard)
export class MyFeatureController { ... }
```

### Step 2: Add Swagger Documentation

```typescript
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';

@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
@Get('resource')
getResource(@CurrentUser() user: AuthUser) {
  return this.service.getResource(user.userId);
}
```

### Step 3: Extract User Information

```typescript
import { CurrentUser } from '@common/decorators/public.decorator';
import { AuthUser } from '@modules/auth/strategies/jwt.strategy';

@Get('resource')
getResource(@CurrentUser() user: AuthUser) {
  // user.userId - authenticated user ID
  // user.sessionId - current session ID
  // user.jti - JWT ID for revocation tracking
  return this.service.getResource(user.userId);
}
```

### Step 4: Make Routes Public (if needed)

```typescript
import { Public } from '@common/decorators/public.decorator';

@Public()  // Override guard for this route only
@Get('public-resource')
getPublicResource() {
  return this.service.getPublicResource();
}
```

---

## Security Considerations

### Token Storage (Frontend)
- ✅ **Access Token**: Store in memory or sessionStorage (no XSS risk if using httpOnly impossible)
- ✅ **Refresh Token**: Store in httpOnly cookie (protected from XSS)
- ❌ **Never**: localStorage (vulnerable to XSS attacks)

### Token Transmission
- ✅ Always use HTTPS in production
- ✅ Use `Authorization: Bearer` header
- ❌ Never send token in URL query parameters

### Session Management
- ✅ Sessions tracked by JTI (JWT ID) in database
- ✅ Logout revokes session immediately
- ✅ Refresh rotates tokens (old revoked)
- ✅ Expired tokens automatically invalid

### Account Protection
- ✅ User status validated on each request (ACTIVE only)
- ✅ Session status validated (ACTIVE only)
- ✅ Token signature verified
- ✅ Login attempt tracking prevents brute force

---

## Troubleshooting

### "Unauthorized" on Protected Route

1. **Missing token**: Add `Authorization: Bearer <token>` header
2. **Invalid token**: Check token format and expiry
3. **Session revoked**: Log in again to get new token
4. **User account inactive**: Admin may have suspended account

### Token Expired

1. Use `/auth/refresh` to get new token
2. Include refreshToken from login response
3. Retry original request with new accessToken

### CORS Issues with Token

1. Ensure `credentials: 'include'` in fetch options
2. Configure CORS on server side
3. Use httpOnly cookies with secure flag

---

## Summary Table

| Aspect | Details |
|--------|---------|
| **Public Routes** | Auth (register, login, verify, reset), Health checks |
| **Protected Routes** | Identity, MFA, Logout, any user-specific data |
| **Guard Method** | `@UseGuards(JwtAuthGuard)` at controller level |
| **Override** | Use `@Public()` decorator on specific routes |
| **Token Header** | `Authorization: Bearer <accessToken>` |
| **Access Token Expiry** | 15 minutes |
| **Refresh Token Expiry** | 30 days |
| **Get User Info** | `@CurrentUser() user: AuthUser` |
| **Revocation** | Via JTI in database (logout, refresh) |

---

## Next Steps

1. Review protected endpoints documentation in Swagger UI
2. Implement token management in frontend
3. Add error handling for 401 responses
4. Set up automatic token refresh before expiry
5. Configure HTTPS for production
6. Review CORS settings for your domain

See [AUTH_API.md](./AUTH_API.md) for complete API reference.
