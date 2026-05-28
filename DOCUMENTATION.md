# API Documentation

The Imari API provides **two beautiful documentation interfaces** for exploring and testing endpoints:

## 📘 Swagger UI (Default)

**URL**: http://localhost:3000/api/v1/docs

### Features
- ✅ Interactive endpoint testing
- ✅ "Try it out" button for live requests
- ✅ Request/response examples
- ✅ Schema visualization
- ✅ Authorize button for JWT tokens
- ✅ Dark mode support
- ✅ Download OpenAPI spec

### Best For
- **Interactive API testing**
- **Learning the API**
- **Quick endpoint exploration**
- **Developers who want live testing**

### Screenshot
```
┌─────────────────────────────────────────────────────────┐
│ Swagger UI                                     🔍 Search │
├─────────────────────────────────────────────────────────┤
│ [Authorize] [Download]                                  │
├─────────────────────────────────────────────────────────┤
│ ▼ Auth                                                   │
│   POST   /auth/register                        [Try it] │
│   POST   /auth/login                           [Try it] │
│   POST   /auth/logout                          [Try it] │
│                                                          │
│ ▼ Identity                                               │
│   GET    /identity/profile                     [Try it] │
│   PATCH  /identity/profile                     [Try it] │
│                                                          │
│ ▼ MFA                                                    │
│   POST   /mfa/enable                           [Try it] │
│   POST   /mfa/confirm                          [Try it] │
└─────────────────────────────────────────────────────────┘
```

---

## 📕 ReDoc (Beautiful Alternative)

**URL**: http://localhost:3000/redoc

### Features
- ✅ Beautiful, responsive design
- ✅ Single-page documentation
- ✅ Excellent mobile view
- ✅ Built-in search
- ✅ Schema definitions sidebar
- ✅ Code samples in multiple languages
- ✅ Three-panel layout (navigation, docs, examples)
- ✅ Print-friendly

### Best For
- **Reading/exploring documentation**
- **Mobile browsing**
- **Sharing documentation**
- **Generating PDF (print to PDF)**
- **Clean, professional presentation**
- **Reference documentation**

### Screenshot
```
┌──────────────┬──────────────────────────┬──────────────┐
│  Navigation  │     Documentation        │   Examples   │
├──────────────┼──────────────────────────┼──────────────┤
│              │                          │              │
│ Auth         │ POST /auth/register      │ Request:     │
│ ├─ register  │ Create user account      │              │
│ ├─ login     │                          │ {            │
│ ├─ logout    │ Parameters:              │   "email":   │
│ ├─ refresh   │ • email (required)       │   "..."      │
│ ├─ verify    │ • password (required)    │ }            │
│ └─ reset     │ • phone (required)       │              │
│              │                          │ Response:    │
│ Identity     │ Request body:            │              │
│ ├─ profile   │ {...}                    │ {            │
│ ├─ devices   │                          │   "status":  │
│ └─ kyc       │ Responses:               │   201        │
│              │ 201: Created             │ }            │
│ MFA          │ 400: Bad Request         │              │
│ ├─ enable    │ 409: Conflict            │              │
│ ├─ confirm   │                          │              │
│ ├─ backup    │                          │              │
│ └─ disable   │                          │              │
│              │                          │              │
│ 🔍 Search   │ 🖨️  Print               │ 📋 Copy     │
└──────────────┴──────────────────────────┴──────────────┘
```

---

## Comparison Table

| Feature | Swagger UI | ReDoc |
|---------|-----------|-------|
| **Interactive Testing** | ✅ Yes | ❌ No |
| **Beautiful Design** | ✅ Good | ✅ Excellent |
| **Mobile Friendly** | ✅ Good | ✅ Excellent |
| **Search** | ✅ Yes | ✅ Yes |
| **Dark Mode** | ✅ Yes | ❌ No |
| **Code Examples** | ✅ Basic | ✅ Multiple Languages |
| **Try It Out** | ✅ Yes | ❌ No |
| **Print to PDF** | ✅ OK | ✅ Excellent |
| **Learning Curve** | ⭐⭐⭐ | ⭐ |
| **Professional Look** | ⭐⭐⭐ | ⭐⭐⭐⭐ |

---

## OpenAPI/Swagger Spec

The raw OpenAPI specification (JSON format) is available at:

**URL**: http://localhost:3000/api/v1/swagger-json

### Usage
- Import into Postman, Insomnia, or other API clients
- Generate client libraries (OpenAPI Generator)
- Reference in documentation
- Integrate with CI/CD pipelines

### Example Import (Postman)
```
1. Open Postman
2. Click "Import"
3. Select "Link" tab
4. Paste: http://localhost:3000/api/v1/swagger-json
5. Click Import
```

---

## Using Swagger UI for Testing

### Step 1: Authorize with Bearer Token

```
1. Click [Authorize] button (top-right)
2. Enter access token: Bearer eyJhbGciOiJIUzI1NiIs...
3. Click [Authorize]
4. Click [Close]
```

### Step 2: Test Protected Endpoint

```
1. Find endpoint (e.g., GET /identity/profile)
2. Click endpoint to expand
3. Click [Try it out] button
4. Click [Execute]
5. View response below
```

### Step 3: Copy cURL Command

```
1. Expand endpoint
2. Click [Try it out]
3. At bottom: Click [Copy] under "<> curl" section
4. Paste in terminal and run
```

### Example cURL Command
```bash
curl -X GET "http://localhost:3000/api/v1/identity/profile" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "accept: application/json"
```

---

## Using ReDoc for Documentation

### Step 1: Search for Endpoint

```
1. Click 🔍 search box (left panel)
2. Type endpoint name: "profile", "login", etc.
3. Click result to jump
```

### Step 2: Read Documentation

```
1. Left panel: Navigation tree
2. Center panel: Full documentation
3. Right panel: Request/response examples
4. Scroll to read complete details
```

### Step 3: Get Examples

```
1. Right panel shows example request/response
2. All fields documented with types
3. Required fields marked with *
4. Descriptions for each field
```

### Step 4: Print/Save as PDF

```
1. Click 🖨️ Print button
2. Select "Save as PDF"
3. Configure margins/headers
4. Save
```

---

## Architecture

### Documentation Stack

```
┌─────────────────────────────────────────────┐
│  Browser                                    │
├─────────────────────────────────────────────┤
│  http://localhost:3000/api/v1/docs (Swagger)│
│  http://localhost:3000/redoc (ReDoc)        │
└─────────────────────────────────────────────┘
         ↑                    ↑
         │                    │
    Swagger UI CDN       ReDoc CDN + HTML
         │                    │
         └────────┬───────────┘
                  │
         ┌────────↓─────────┐
         │   NestJS App     │
         ├──────────────────┤
         │  Main.ts:        │
         │  • Swagger setup │
         │  • JSON spec     │
         │  • OpenAPI doc   │
         └──────────────────┘
                  │
         ┌────────↓─────────────────┐
         │   DocsModule             │
         ├──────────────────────────┤
         │  RedocController:        │
         │  • Serves ReDoc HTML     │
         │  • References spec       │
         │  • Public endpoint       │
         └──────────────────────────┘
```

### File Structure

```
src/modules/docs/
├── docs.module.ts           # Docs module definition
└── redoc.controller.ts      # ReDoc HTML endpoint

src/main.ts                  # Swagger + JSON spec setup
src/app.module.ts            # Imports DocsModule
```

### Endpoint Mapping

| URL | Purpose | Provider |
|-----|---------|----------|
| `/api/v1/docs` | Swagger UI interactive docs | @nestjs/swagger |
| `/api/v1/swagger-json` | OpenAPI JSON spec | @nestjs/swagger |
| `/redoc` | ReDoc documentation | Custom DocsModule |

---

## Configuration

### Disabling in Production

Both Swagger UI and ReDoc are **automatically disabled in production** by environment check:

```typescript
if (nodeEnv !== 'production') {
  // Documentation only available in development
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);
  SwaggerModule.setup(`${apiPrefix}/swagger-json`, app, document);
}
```

### Custom Configuration

Edit `src/main.ts` to customize:

```typescript
const swaggerConfig = new DocumentBuilder()
  .setTitle('Imari API')
  .setDescription('Your description')
  .setVersion('1.0.0')
  .addBearerAuth()
  .addTag('Auth', 'Authentication endpoints')
  .addTag('Identity', 'User profile & identity')
  .addTag('MFA', 'Multi-factor authentication')
  .build();
```

---

## Best Practices

### For API Consumers

1. **Start with ReDoc**
   - Get overview of available endpoints
   - Understand authentication requirements
   - Review response schemas

2. **Use Swagger UI for Testing**
   - Test endpoints interactively
   - Get exact request/response formats
   - Copy cURL commands

3. **Keep OpenAPI Spec Updated**
   - All code changes must update Swagger decorators
   - Keep decorators in sync with implementation
   - Document all breaking changes

### For API Developers

1. **Always Document Endpoints**
   ```typescript
   @Get('profile')
   @ApiOperation({ summary: 'Get profile' })
   @ApiResponse({ status: 200, description: 'Success' })
   @ApiUnauthorizedResponse({ description: 'Missing token' })
   getProfile(@CurrentUser() user: AuthUser) { ... }
   ```

2. **Include Error Responses**
   ```typescript
   @ApiNotFoundResponse({ description: 'User not found' })
   @ApiBadRequestResponse({ description: 'Invalid input' })
   ```

3. **Provide Examples**
   ```typescript
   @ApiResponse({
     status: 200,
     example: { id: 'uuid', email: 'user@example.com' }
   })
   ```

---

## Troubleshooting

### Documentation Not Loading

**Issue**: Swagger UI shows blank page

**Solution**:
1. Check if running in development mode
2. Verify port 3000 is accessible
3. Clear browser cache
4. Check console for errors

### ReDoc Not Appearing

**Issue**: `/redoc` returns 404

**Solution**:
1. Verify DocsModule is imported in AppModule
2. Check RedocController is exported from DocsModule
3. Verify no route conflicts
4. Restart development server

### Bearer Token Not Working

**Issue**: 401 on protected endpoints in Swagger

**Solution**:
1. Click [Authorize] button
2. Enter: `Bearer <your-token>`
3. Don't include `Bearer` in token field (it adds it automatically in Swagger UI)
4. Ensure token is not expired
5. Check Authorization header format

### Swagger JSON Not Accessible

**Issue**: `/api/v1/swagger-json` returns 404

**Solution**:
1. Verify Swagger is enabled (not production)
2. Try accessing with `curl`: `curl http://localhost:3000/api/v1/swagger-json`
3. Check logs for setup errors
4. Verify all endpoints have proper decorators

---

## Next Steps

1. ✅ Access Swagger UI: http://localhost:3000/api/v1/docs
2. ✅ Access ReDoc: http://localhost:3000/redoc
3. ✅ Get access token by logging in
4. ✅ Test protected endpoints in Swagger UI
5. ✅ Export OpenAPI spec for external tools

---

## Additional Resources

- [Swagger/OpenAPI Specification](https://swagger.io/specification/)
- [ReDoc Documentation](https://redoc.ly/)
- [NestJS Swagger Module](https://docs.nestjs.com/openapi/introduction)
- [OpenAPI Decorators Reference](https://docs.nestjs.com/openapi/decorators)

---

## Support

For documentation issues:
1. Check [ROUTE_PROTECTION.md](./ROUTE_PROTECTION.md) for authentication details
2. Review [AUTH_API.md](./AUTH_API.md) for API reference
3. Check [AUTH_COMPLETE.md](./AUTH_COMPLETE.md) for implementation summary
