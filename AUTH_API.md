# Imari Backend - Auth API Documentation

## Overview

The Imari Auth API provides a complete authentication flow with email verification, JWT token management, password reset, and MFA support. All responses follow a consistent API response format with proper HTTP status codes and error handling.

## Getting Started

### Environment Setup

```bash
# Clone and install
npm install

# Set up environment variables (copy from .env.example)
cp .env.example .env

# Start Docker services
npm run db:up

# Run migrations
npm run db:migrate

# Start development server
npm run dev
```

### Access API Documentation

Once the server is running, visit:
- **Swagger UI**: http://localhost:3000/api/v1/docs
- **API Base URL**: http://localhost:3000/api/v1

## Complete Auth Flow

### 1. Register User

**Endpoint**: `POST /auth/register`

**Request**:
```json
{
  "email": "john@example.com",
  "phone": "+250788000000",
  "password": "SecurePass@123",
  "firstName": "John",
  "lastName": "Doe",
  "referralCode": "IMR-XXXXX" // optional
}
```

**Response** (201 Created):
```json
{
  "statusCode": 201,
  "data": {
    "message": "Account created. Check your email for a verification code."
  },
  "timestamp": "2024-05-25T08:57:33.123Z"
}
```

**Validations**:
- Email: valid email format, must be unique
- Phone: E.164 format (e.g., +250788000000), must be unique
- Password: 8+ chars, 1 uppercase, 1 lowercase, 1 digit
- FirstName/LastName: 1-50 characters
- Returns 409 Conflict if email or phone already registered

**User Status After Registration**: `PENDING` (must verify email before login)

---

### 2. Verify Email

**Endpoint**: `POST /auth/verify-email`

**Request**:
```json
{
  "email": "john@example.com",
  "otp": "123456"
}
```

**Response** (200 OK):
```json
{
  "statusCode": 200,
  "data": {
    "message": "Email verified. You can now log in."
  },
  "timestamp": "2024-05-25T08:57:34.456Z"
}
```

**What Happens on Success**:
- User status changes from `PENDING` → `ACTIVE`
- KYC tier set to `TIER_1`
- User can now log in
- OTP is marked as used (single-use)

**Error Cases**:
- 400 Bad Request: Invalid or expired OTP
- 400 Bad Request: Email already verified
- 404 Not Found: User not found

---

### 3. Login User

**Endpoint**: `POST /auth/login`

**Basic Login**:
```json
{
  "email": "john@example.com",
  "password": "SecurePass@123"
}
```

**Login with Device Info** (recommended for mobile):
```json
{
  "email": "john@example.com",
  "password": "SecurePass@123",
  "device": {
    "deviceId": "device-uuid-1234",
    "deviceName": "iPhone 14",
    "deviceType": "IOS",
    "platform": "iPhone OS",
    "osVersion": "17.1.2",
    "appVersion": "1.2.5",
    "fingerprint": "abc123def456xyz789",
    "pushToken": "fcm_token_xxxxx"
  }
}
```

**Login with MFA**:
```json
{
  "email": "john@example.com",
  "password": "SecurePass@123",
  "totpCode": "123456"
}
```

**Response** (200 OK):
```json
{
  "statusCode": 200,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
    "user": {
      "id": "uuid-1234",
      "email": "john@example.com",
      "phone": "+250788000000",
      "firstName": "John",
      "lastName": "Doe",
      "kycTier": "TIER_1",
      "preferredCurrency": "USD",
      "profilePhotoUrl": null,
      "isMfaEnabled": false
    }
  },
  "timestamp": "2024-05-25T08:57:35.789Z"
}
```

**Token Details**:
- **Access Token**: 15-minute validity, includes user ID (sub), JTI, and issued time (iat)
- **Refresh Token**: 30-day validity, secure token stored as hash in DB
- Both tokens are required for the full auth flow

**Security Features**:
- **Login Attempt Tracking**: Failed login attempts are tracked per email
- **Account Lockout**: After 5 failed attempts within 15 minutes, account is locked
- **Device Registration**: Device info is stored for multi-device support
- **Audit Logging**: All login attempts are logged with IP and user agent
- **Last Login Time**: User's `lastLoginAt` is updated

**Error Cases**:
- 401 Unauthorized: Invalid email or password
- 401 Unauthorized: MFA code required but not provided
- 403 Forbidden: Email not verified
- 403 Forbidden: Account is PENDING, SUSPENDED, or CLOSED
- 429 Too Many Requests: Account locked due to failed login attempts

---

### 4. Refresh Tokens

**Endpoint**: `POST /auth/refresh`

**Request**:
```json
{
  "refreshToken": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
}
```

**Response** (200 OK):
```json
{
  "statusCode": 200,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4"
  },
  "timestamp": "2024-05-25T08:57:36.234Z"
}
```

**How Token Rotation Works**:
1. Old refresh token is marked as revoked in database
2. New refresh token is issued (30-day validity)
3. New access token is issued (15-minute validity)
4. Both old tokens can no longer be used

**Storage Recommendation**:
- **Refresh Token**: Store in httpOnly, secure, sameSite cookie (prevent XSS)
- **Access Token**: Can be stored in memory/state during session
- Never store sensitive tokens in localStorage

**Error Cases**:
- 401 Unauthorized: Invalid refresh token
- 401 Unauthorized: Refresh token expired
- 401 Unauthorized: Refresh token already revoked

---

### 5. Logout User

**Endpoint**: `POST /auth/logout`

**Headers Required**:
```
Authorization: Bearer <accessToken>
```

**Request**: Empty body

**Response** (200 OK):
```json
{
  "statusCode": 200,
  "data": {
    "message": "Logged out successfully"
  },
  "timestamp": "2024-05-25T08:57:37.567Z"
}
```

**What Happens**:
- Current session is marked as REVOKED
- Access token becomes invalid immediately
- User must log in again to get new tokens
- Audit log entry is created

**Error Cases**:
- 401 Unauthorized: Missing or invalid access token

---

### 6. Forgot Password

**Endpoint**: `POST /auth/forgot-password`

**Request**:
```json
{
  "email": "john@example.com"
}
```

**Response** (200 OK):
```json
{
  "statusCode": 200,
  "data": {
    "message": "If that email is registered, a reset code has been sent."
  },
  "timestamp": "2024-05-25T08:57:38.234Z"
}
```

**Security Note**: Returns success message **regardless of email existence** to prevent email enumeration attacks.

**What Happens Internally** (if email exists):
1. Previous unused reset OTPs are marked as used
2. New OTP is generated (6 digits, 30-minute expiry)
3. Email is sent with OTP code
4. No information leaked about email existence

---

### 7. Reset Password

**Endpoint**: `POST /auth/reset-password`

**Request**:
```json
{
  "email": "john@example.com",
  "otp": "123456",
  "newPassword": "NewSecurePass@456"
}
```

**Response** (200 OK):
```json
{
  "statusCode": 200,
  "data": {
    "message": "Password reset successfully. Please log in with your new password."
  },
  "timestamp": "2024-05-25T08:57:39.123Z"
}
```

**Password Validation**:
- Minimum 8 characters
- Must contain at least 1 uppercase letter
- Must contain at least 1 lowercase letter
- Must contain at least 1 digit

**What Happens After Reset**:
1. All active sessions are revoked (user logged out everywhere)
2. Password hash is updated in database
3. User must log in with new password
4. OTP is marked as used (single-use)

**Error Cases**:
- 400 Bad Request: OTP invalid or expired
- 400 Bad Request: Password doesn't meet requirements
- 404 Not Found: User not found

---

## Response Format

All endpoints return responses in this standardized format:

```typescript
{
  statusCode: number;      // HTTP status code (200, 201, 400, 401, etc.)
  data: any;               // Response payload (varies by endpoint)
  error?: object | null;   // Error details (null on success)
  timestamp: string;       // ISO 8601 timestamp of response
}
```

## Error Handling

### HTTP Status Codes

| Status | Meaning | Example |
|--------|---------|---------|
| 200 | Success | Login, token refresh, logout, password reset |
| 201 | Created | User registration |
| 400 | Bad Request | Validation error, expired OTP, invalid password |
| 401 | Unauthorized | Invalid credentials, invalid token |
| 403 | Forbidden | Email not verified, account suspended |
| 404 | Not Found | User not found |
| 409 | Conflict | Email or phone already registered |
| 429 | Too Many Requests | Account locked due to failed login attempts |
| 500 | Server Error | Database or unexpected error |

### Error Response Example

```json
{
  "statusCode": 400,
  "data": null,
  "error": {
    "message": "Validation failed",
    "error": "VALIDATION_ERROR",
    "errors": [
      {
        "path": "password",
        "message": "Password must contain at least one uppercase letter"
      }
    ]
  },
  "timestamp": "2024-05-25T08:57:40.123Z"
}
```

---

## Token Structure

### Access Token (JWT)

**Headers**:
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

**Payload**:
```json
{
  "sub": "user-uuid",        // User ID
  "jti": "session-jti",      // JWT ID for session tracking
  "iat": 1716661640,         // Issued at timestamp
  "exp": 1716662540          // Expires at timestamp (15 minutes later)
}
```

**Usage**: Include in Authorization header: `Authorization: Bearer <token>`

### Refresh Token

- Secure random token generated server-side
- Only the hash is stored in database (not the raw token)
- 30-day expiry
- Can only be used on `/auth/refresh` endpoint
- Marked as revoked after use (single-use)
- Not a JWT - just a random string

---

## Security Best Practices

### Token Storage (Frontend)

```javascript
// ✅ GOOD: Store in httpOnly cookie
document.cookie = `refreshToken=${token}; httpOnly; secure; sameSite=Strict; max-age=${30*24*60*60}`;

// ✅ GOOD: Store access token in memory
let accessToken = response.data.accessToken;

// ❌ BAD: Never store sensitive tokens in localStorage
localStorage.setItem('accessToken', token); // Vulnerable to XSS
localStorage.setItem('refreshToken', token); // Vulnerable to XSS
```

### API Call Examples

**Login**:
```typescript
const response = await fetch('http://localhost:3000/api/v1/auth/login', {
  method: 'POST',
  credentials: 'include',  // Send cookies
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});

const { data } = await response.json();
// Store accessToken in memory, refreshToken in httpOnly cookie
```

**Authenticated Request**:
```typescript
const response = await fetch('http://localhost:3000/api/v1/identity/profile', {
  method: 'GET',
  credentials: 'include',  // Send cookies
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  }
});
```

**Refresh Token**:
```typescript
const response = await fetch('http://localhost:3000/api/v1/auth/refresh', {
  method: 'POST',
  credentials: 'include',  // Send + receive cookies
  headers: { 'Content-Type': 'application/json' }
  // Don't include token in body - it comes from cookie
});
```

---

## Account Lockout

After **5 failed login attempts** within **15 minutes**, the account is locked.

**Lockout Window**: 15 minutes from first failed attempt

**Recovery**:
- Wait 15 minutes for lockout to expire automatically
- Or use forgot-password flow to reset password (unlocks account)

**Failed Attempt Tracking**:
- Tracked per email address
- IP address and user agent are logged
- Audit logs contain all login attempt details

---

## MFA (Multi-Factor Authentication)

### Enable MFA

See the MFA module documentation for:
- `POST /mfa/enable` - Enable TOTP-based MFA
- `GET /mfa/backup-codes` - Generate backup codes

### Login with MFA

When MFA is enabled on an account:
1. MFA code generation starts with authenticator app (Google Authenticator, Authy, Microsoft Authenticator)
2. User must provide `totpCode` in login request
3. 6-digit code from authenticator app (30-second window)

---

## Testing the Auth Flow

### Using cURL

```bash
# 1. Register
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "phone": "+250788000000",
    "password": "TestPass@123",
    "firstName": "Test",
    "lastName": "User"
  }'

# 2. Verify Email (check email service at http://localhost:1025 for OTP)
curl -X POST http://localhost:3000/api/v1/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "otp": "XXXXXX"
  }'

# 3. Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass@123"
  }'

# 4. Refresh Token (from response above)
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "TOKEN_FROM_LOGIN_RESPONSE"
  }'

# 5. Logout (use accessToken from login)
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -H "Authorization: Bearer ACCESS_TOKEN_FROM_LOGIN" \
  -H "Content-Type: application/json"
```

### Using Swagger UI

1. Navigate to http://localhost:3000/api/v1/docs
2. All endpoints are documented with example requests/responses
3. Click "Try it out" to test directly from browser
4. For protected endpoints, click "Authorize" button to add Bearer token

### Running E2E Tests

```bash
# Start Docker services
npm run db:up

# Run migrations
npm run db:migrate

# Run tests
npm run test:e2e

# View test output
npm run test:e2e -- --verbose
```

---

## Database Schema

### Key Tables

- **User**: Email, phone, password hash, profile info, account status, KYC tier
- **UserSession**: Access token JTI, refresh token hash, expiry, status (ACTIVE/REVOKED)
- **OTPCode**: Email/phone, code hash, purpose (EMAIL_VERIFY/RESET_PASSWORD), expiry, used flag
- **LoginAttempt**: Email, success/failure, reason, IP address, user agent
- **AuditLog**: User ID, action (LOGIN/LOGOUT/PASSWORD_CHANGE), IP, user agent, device info

---

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://imari:imari_dev_password@localhost:5432/imari_db
DIRECT_DATABASE_URL=postgresql://imari:imari_dev_password@localhost:5432/imari_db

# JWT
JWT_ACCESS_SECRET=<64-char-hex-string>
JWT_REFRESH_SECRET=<64-char-hex-string>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

# Encryption
ENCRYPTION_KEY=<64-char-hex-string>

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Email
MAIL_HOST=localhost
MAIL_PORT=1025
MAIL_FROM=Imari <no-reply@imari.local>

# App
NODE_ENV=development
PORT=3000
API_PREFIX=api/v1
THROTTLE_TTL=60
THROTTLE_LIMIT=100
```

---

## Common Issues

### Email OTP Not Received

**Check MailHog**:
- Open http://localhost:1025 (MailHog UI)
- All sent emails appear here in development
- Copy OTP from email and use in verify-email endpoint

### Token Expired

- Access token: 15-minute expiry, use refresh endpoint
- Refresh token: 30-day expiry, must log in again

### Account Locked

- 5 failed login attempts in 15 minutes locks account
- Wait 15 minutes or reset password

### CORS Issues

- CORS is enabled for all origins in development
- In production, set `CORS_ORIGIN` environment variable

---

## Next Steps

After completing auth setup:
1. **Identity Module**: Profile management, device registration, KYC upload
2. **MFA Module**: TOTP setup, backup codes
3. **Email Integration**: Custom email templates, real email provider
4. **Frontend Integration**: React/Vue implementation with token management
5. **Production Deployment**: Docker deployment, environment hardening

---

## Support

For issues or questions:
- Check Swagger UI: http://localhost:3000/api/v1/docs
- View audit logs in database for troubleshooting
- Review test cases: `test/auth.e2e-spec.ts`
