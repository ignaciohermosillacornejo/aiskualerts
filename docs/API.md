# AISKUAlerts API Documentation

This document provides comprehensive documentation for all API endpoints in the AISKUAlerts application.

## Base URL

```
https://your-domain.com/api
```

## Authentication

Most endpoints require authentication via session cookies. Authentication is established through the OAuth flow with Bsale.

### Session Token

After successful authentication, a `session_token` HTTP-only cookie is set with:
- **Duration**: 30 days
- **Flags**: `HttpOnly`, `Secure` (production), `SameSite=Strict` (production)

### CSRF Protection

All state-changing requests (POST, PUT, DELETE, PATCH) require a valid CSRF token:
- **Header**: `X-CSRF-Token`
- **Value**: Must match the `csrf_token` cookie value
- **Excluded paths**: `/api/webhooks/*`, `/api/auth/bsale/*`

---

## Rate Limiting

All endpoints are rate limited using a sliding window algorithm.

| Preset | Limit | Endpoints |
|--------|-------|-----------|
| `auth` | 10 requests/minute | `/api/auth/*` |
| `api` | 100 requests/minute | All other API endpoints |
| `webhook` | 1000 requests/minute | `/api/webhooks/*` |

### Rate Limit Response Headers

```
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1704067200
```

### Rate Limited Response (429)

```json
{
  "error": "Too many requests",
  "retryAfter": 45
}
```

---

## Error Responses

### Validation Error (400)

```json
{
  "error": "Validation failed",
  "details": [
    {
      "path": "email",
      "message": "Invalid email format"
    }
  ]
}
```

### Authentication Error (401)

```json
{
  "error": "Unauthorized"
}
```

### CSRF Error (403)

```json
{
  "error": "CSRF token validation failed"
}
```

### Not Found (404)

```json
{
  "error": "Not found"
}
```

### Internal Server Error (500)

```json
{
  "error": "Internal server error"
}
```

---

## Endpoints

### Authentication

#### POST /api/auth/login

Authenticate a user with email and password.

**Authentication**: None required

**Rate Limit**: 10 requests/minute

**Request Body**:

```json
{
  "email": "user@example.com",
  "password": "your-password"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Valid email address |
| `password` | string | Yes | User password (min 1 character) |

**Response (200)**:

```json
{
  "user": {
    "id": "uuid-string",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "admin"
  }
}
```

**Side Effects**: Sets `session_token` HTTP-only cookie

**curl Example**:

```bash
curl -X POST https://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "your-password"}' \
  -c cookies.txt
```

---

#### POST /api/auth/logout

End the current user session.

**Authentication**: Optional

**Rate Limit**: 10 requests/minute

**Request Body**: None

**Response (200)**:

```json
{
  "success": true
}
```

**Side Effects**: Clears `session_token` cookie, deletes session from database

**curl Example**:

```bash
curl -X POST https://your-domain.com/api/auth/logout \
  -H "X-CSRF-Token: your-csrf-token" \
  -b cookies.txt
```

---

#### GET /api/auth/me

Get the current authenticated user's information.

**Authentication**: Optional

**Request Body**: None

**Response (200)** - When authenticated:

```json
{
  "user": {
    "id": "uuid-string",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "admin"
  }
}
```

**Response (401)** - When unauthenticated:

```json
{
  "user": null
}
```

**curl Example**:

```bash
curl https://your-domain.com/api/auth/me \
  -b cookies.txt
```

---

#### GET /api/auth/bsale/start

Initiate the Bsale OAuth flow.

**Authentication**: None required

**Rate Limit**: 10 requests/minute

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `client_code` | string | Yes | Bsale client code |

**Response**: 302 Redirect to Bsale authorization URL

**Process**:
1. Generates PKCE challenge + code_verifier
2. Generates CSRF state token
3. Stores state + code_verifier (10-minute TTL)
4. Redirects to Bsale authorization URL

**curl Example**:

```bash
curl -L "https://your-domain.com/api/auth/bsale/start?client_code=your-client-code"
```

---

#### GET /api/auth/bsale/callback

Handle the Bsale OAuth callback.

**Authentication**: None required

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | string | Yes | Bsale authorization code |
| `state` | string | Yes | CSRF state token |

**Response**: 302 Redirect to `/app` with session cookies

**Error Response (400/500)**:

```json
{
  "error": "Error description"
}
```

---

### Dashboard

#### GET /api/dashboard/stats

Get dashboard statistics for the authenticated user.

**Authentication**: Optional (returns mock data if unauthenticated)

**Request Body**: None

**Response (200)**:

```json
{
  "totalProducts": 150,
  "activeAlerts": 5,
  "lowStockProducts": 12,
  "configuredThresholds": 25
}
```

| Field | Type | Description |
|-------|------|-------------|
| `totalProducts` | number | Count of distinct products synced |
| `activeAlerts` | number | Pending alerts for user |
| `lowStockProducts` | number | Products below threshold (default: 10) |
| `configuredThresholds` | number | User's threshold count |

**curl Example**:

```bash
curl https://your-domain.com/api/dashboard/stats \
  -b cookies.txt
```

---

### Alerts

#### GET /api/alerts

Get a list of alerts for the authenticated user.

**Authentication**: Optional

**Query Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `type` | string | No | - | Filter by alert type |
| `limit` | number | No | 100 | Maximum results to return |

**Alert Types**:
- `threshold_breach` - Stock fell below configured threshold
- `low_velocity` - Low sales velocity detected
- `out_of_stock` - Product is out of stock

**Response (200)**:

```json
{
  "alerts": [
    {
      "id": "uuid-string",
      "type": "threshold_breach",
      "productId": "12345",
      "productName": "Example Product",
      "message": "Stock level is below threshold",
      "createdAt": "2024-01-15T10:30:00Z",
      "dismissedAt": null
    }
  ],
  "total": 1
}
```

**curl Example**:

```bash
# Get all alerts
curl https://your-domain.com/api/alerts \
  -b cookies.txt

# Filter by type
curl "https://your-domain.com/api/alerts?type=threshold_breach&limit=50" \
  -b cookies.txt
```

---

#### POST /api/alerts/:id/dismiss

Dismiss a specific alert.

**Authentication**: Required

**URL Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Alert ID |

**Request Body**: None

**Response (200)**:

```json
{
  "success": true
}
```

**Error Response (404)**:

```json
{
  "error": "Alert not found"
}
```

**curl Example**:

```bash
curl -X POST https://your-domain.com/api/alerts/uuid-string/dismiss \
  -H "X-CSRF-Token: your-csrf-token" \
  -b cookies.txt
```

---

### Products

#### GET /api/products

Get a list of all products for the authenticated user.

**Authentication**: Optional

**Request Body**: None

**Response (200)**:

```json
{
  "products": [
    {
      "id": "uuid-string",
      "bsaleId": 12345,
      "sku": "SKU-001",
      "name": "Example Product",
      "currentStock": 50,
      "threshold": 10,
      "lastSyncAt": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 1
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Internal product ID |
| `bsaleId` | number | Bsale variant ID |
| `sku` | string | Product SKU |
| `name` | string | Product name |
| `currentStock` | number | Current stock quantity |
| `threshold` | number \| null | User's configured threshold |
| `lastSyncAt` | string | Last sync timestamp (ISO 8601) |

**curl Example**:

```bash
curl https://your-domain.com/api/products \
  -b cookies.txt
```

---

#### GET /api/products/:id

Get details for a specific product.

**Authentication**: Optional

**URL Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Product ID |

**Response (200)**:

```json
{
  "id": "uuid-string",
  "bsaleId": 12345,
  "sku": "SKU-001",
  "name": "Example Product",
  "currentStock": 50,
  "threshold": 10,
  "lastSyncAt": "2024-01-15T10:30:00Z"
}
```

**Error Response (404)**:

```json
{
  "error": "Product not found"
}
```

**curl Example**:

```bash
curl https://your-domain.com/api/products/uuid-string \
  -b cookies.txt
```

---

### Thresholds

#### GET /api/thresholds

Get all configured thresholds for the authenticated user.

**Authentication**: Optional

**Request Body**: None

**Response (200)**:

```json
{
  "thresholds": [
    {
      "id": "uuid-string",
      "productId": "12345",
      "productName": "Example Product",
      "minQuantity": 10,
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 1
}
```

**curl Example**:

```bash
curl https://your-domain.com/api/thresholds \
  -b cookies.txt
```

---

#### POST /api/thresholds

Create a new threshold.

**Authentication**: Required

**Request Body**:

```json
{
  "productId": "12345",
  "minQuantity": 10
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `productId` | string | Yes | Bsale variant ID |
| `minQuantity` | number | Yes | Non-negative integer threshold |

**Response (201)**:

```json
{
  "id": "uuid-string",
  "productId": "12345",
  "productName": "Example Product",
  "minQuantity": 10,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

**Error Response (400)**:

```json
{
  "error": "Validation failed",
  "details": [
    {
      "path": "productId",
      "message": "productId is required"
    }
  ]
}
```

**curl Example**:

```bash
curl -X POST https://your-domain.com/api/thresholds \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: your-csrf-token" \
  -b cookies.txt \
  -d '{"productId": "12345", "minQuantity": 10}'
```

---

#### PUT /api/thresholds/:id

Update an existing threshold.

**Authentication**: Required

**URL Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Threshold ID |

**Request Body**:

```json
{
  "minQuantity": 15
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `minQuantity` | number | Yes | Non-negative integer threshold |

**Response (200)**:

```json
{
  "id": "uuid-string",
  "productId": "12345",
  "productName": "Example Product",
  "minQuantity": 15,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T11:00:00Z"
}
```

**Error Responses**:
- `400`: Validation failed
- `404`: Threshold not found or user doesn't own it

**curl Example**:

```bash
curl -X PUT https://your-domain.com/api/thresholds/uuid-string \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: your-csrf-token" \
  -b cookies.txt \
  -d '{"minQuantity": 15}'
```

---

#### DELETE /api/thresholds/:id

Delete a threshold.

**Authentication**: Required

**URL Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Threshold ID |

**Request Body**: None

**Response (204)**: No content

**Error Response (404)**:

```json
{
  "error": "Threshold not found"
}
```

**curl Example**:

```bash
curl -X DELETE https://your-domain.com/api/thresholds/uuid-string \
  -H "X-CSRF-Token: your-csrf-token" \
  -b cookies.txt
```

---

### Settings

#### GET /api/settings

Get the current user's settings.

**Authentication**: Optional

**Request Body**: None

**Response (200)**:

```json
{
  "companyName": "Example Company",
  "email": "user@example.com",
  "bsaleConnected": true,
  "lastSyncAt": "2024-01-15T10:30:00Z",
  "emailNotifications": true,
  "notificationEmail": "alerts@example.com",
  "syncFrequency": "hourly",
  "digestFrequency": "daily",
  "isPaid": true,
  "subscriptionStatus": "active"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `companyName` | string \| null | Company name |
| `email` | string | User's email |
| `bsaleConnected` | boolean | Bsale integration status |
| `lastSyncAt` | string \| null | Last sync timestamp (ISO 8601) |
| `emailNotifications` | boolean | Email notifications enabled |
| `notificationEmail` | string \| null | Notification email address |
| `syncFrequency` | string | `"hourly"`, `"daily"`, or `"weekly"` |
| `digestFrequency` | string | `"daily"`, `"weekly"`, or `"none"` |
| `isPaid` | boolean | Subscription status |
| `subscriptionStatus` | string | `"none"`, `"active"`, `"cancelled"`, or `"past_due"` |

**curl Example**:

```bash
curl https://your-domain.com/api/settings \
  -b cookies.txt
```

---

#### PUT /api/settings

Update user settings.

**Authentication**: Required

**Request Body** (all fields optional):

```json
{
  "companyName": "New Company Name",
  "email": "new@example.com",
  "emailNotifications": true,
  "notificationEmail": "alerts@example.com",
  "syncFrequency": "daily",
  "digestFrequency": "weekly"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `companyName` | string | No | Company name |
| `email` | string | No | Valid email address |
| `bsaleConnected` | boolean | No | Bsale integration status |
| `lastSyncAt` | string | No | Last sync timestamp |
| `emailNotifications` | boolean | No | Enable email notifications |
| `notificationEmail` | string | No | Valid notification email |
| `syncFrequency` | string | No | `"hourly"`, `"daily"`, or `"weekly"` |
| `digestFrequency` | string | No | `"daily"`, `"weekly"`, or `"none"` |

**Response (200)**: Returns the full settings object (same as GET)

**Error Response (400)**:

```json
{
  "error": "Validation failed",
  "details": [
    {
      "path": "email",
      "message": "Invalid email format"
    }
  ]
}
```

**curl Example**:

```bash
curl -X PUT https://your-domain.com/api/settings \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: your-csrf-token" \
  -b cookies.txt \
  -d '{"syncFrequency": "daily", "emailNotifications": true}'
```

---

### Billing

#### POST /api/billing/checkout

Create a MercadoPago subscription checkout URL.

**Authentication**: Required

**Request Body**: None

**Response (200)**:

```json
{
  "url": "https://www.mercadopago.cl/subscriptions/checkout?preapproval_id=xxx"
}
```

**Error Responses**:
- `401`: Unauthorized
- `404`: User or Tenant not found
- `400`: Already subscribed
- `500`: Failed to create checkout session

**curl Example**:

```bash
curl -X POST https://your-domain.com/api/billing/checkout \
  -H "X-CSRF-Token: your-csrf-token" \
  -b cookies.txt
```

---

#### POST /api/billing/cancel

Cancel an active subscription.

**Authentication**: Required

**Request Body**: None

**Response (200)**:

```json
{
  "message": "Subscription cancelled",
  "endsAt": "2024-02-15T00:00:00Z"
}
```

**Error Responses**:
- `401`: Unauthorized
- `404`: Tenant not found
- `400`: No active subscription
- `500`: Failed to cancel subscription

**Requirements**: Tenant must have an active subscription

**curl Example**:

```bash
curl -X POST https://your-domain.com/api/billing/cancel \
  -H "X-CSRF-Token: your-csrf-token" \
  -b cookies.txt
```

---

### Sync

#### POST /api/sync/trigger

Manually trigger a stock sync from Bsale.

**Authentication**: Required

**Request Body**: None

**Response (200)**:

```json
{
  "success": true,
  "productsUpdated": 150,
  "alertsGenerated": 5,
  "duration": 2500
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Sync completed successfully |
| `productsUpdated` | number | Number of products updated |
| `alertsGenerated` | number | Number of new alerts generated |
| `duration` | number | Sync duration in milliseconds |
| `error` | string | Error message (only on failure) |

**Error Responses**:
- `401`: Unauthorized
- `404`: Tenant not found
- `500`: Sync failed

**curl Example**:

```bash
curl -X POST https://your-domain.com/api/sync/trigger \
  -H "X-CSRF-Token: your-csrf-token" \
  -b cookies.txt
```

---

### Webhooks

#### POST /api/webhooks/mercadopago

Handle MercadoPago webhook events.

**Authentication**: MercadoPago HMAC signature verification (not session-based)

**Rate Limit**: 1000 requests/minute

**CSRF Protection**: Disabled for this endpoint

**Request Headers**:

| Header | Required | Description |
|--------|----------|-------------|
| `x-signature` | Yes | MercadoPago HMAC signature (`ts=xxx,v1=xxx`) |
| `x-request-id` | Yes | Unique request identifier |

**Request Body**:

```json
{
  "type": "subscription_preapproval",
  "data": {
    "id": "preapproval_id"
  }
}
```

**Response (200)**:

```json
{
  "received": true
}
```

**Error Responses**:
- `400`: Missing headers or invalid payload
- `401`: Invalid signature

**Processed Events**:
- `subscription_preapproval` with status `authorized`: Activates subscription
- `subscription_preapproval` with status `cancelled` or `paused`: Deactivates subscription

**Note**: Configure this webhook URL in your MercadoPago application dashboard.

---

## CORS Configuration

All API responses include CORS headers:

```
Access-Control-Allow-Origin: <configured-origin>
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-CSRF-Token
Access-Control-Allow-Credentials: true
```

---

## OpenAPI Schema

```yaml
openapi: 3.0.3
info:
  title: AISKUAlerts API
  version: 1.0.0
  description: Stock alert management system with Bsale integration

servers:
  - url: https://your-domain.com/api
    description: Production server

components:
  securitySchemes:
    cookieAuth:
      type: apiKey
      in: cookie
      name: session_token
    csrfToken:
      type: apiKey
      in: header
      name: X-CSRF-Token

  schemas:
    User:
      type: object
      properties:
        id:
          type: string
          format: uuid
        email:
          type: string
          format: email
        name:
          type: string
        role:
          type: string
          enum: [admin]

    Alert:
      type: object
      properties:
        id:
          type: string
          format: uuid
        type:
          type: string
          enum: [threshold_breach, low_velocity, out_of_stock]
        productId:
          type: string
        productName:
          type: string
        message:
          type: string
        createdAt:
          type: string
          format: date-time
        dismissedAt:
          type: string
          format: date-time
          nullable: true

    Product:
      type: object
      properties:
        id:
          type: string
          format: uuid
        bsaleId:
          type: integer
        sku:
          type: string
        name:
          type: string
        currentStock:
          type: integer
        threshold:
          type: integer
          nullable: true
        lastSyncAt:
          type: string
          format: date-time

    Threshold:
      type: object
      properties:
        id:
          type: string
          format: uuid
        productId:
          type: string
          nullable: true
        productName:
          type: string
        minQuantity:
          type: integer
          minimum: 0
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time

    Settings:
      type: object
      properties:
        companyName:
          type: string
          nullable: true
        email:
          type: string
          format: email
        bsaleConnected:
          type: boolean
        lastSyncAt:
          type: string
          format: date-time
          nullable: true
        emailNotifications:
          type: boolean
        notificationEmail:
          type: string
          format: email
          nullable: true
        syncFrequency:
          type: string
          enum: [hourly, daily, weekly]
        digestFrequency:
          type: string
          enum: [daily, weekly, none]
        isPaid:
          type: boolean
        subscriptionStatus:
          type: string
          enum: [none, active, cancelled, past_due]

    DashboardStats:
      type: object
      properties:
        totalProducts:
          type: integer
        activeAlerts:
          type: integer
        lowStockProducts:
          type: integer
        configuredThresholds:
          type: integer

    Error:
      type: object
      properties:
        error:
          type: string
        details:
          type: array
          items:
            type: object
            properties:
              path:
                type: string
              message:
                type: string

paths:
  /auth/login:
    post:
      summary: Authenticate user
      tags: [Authentication]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email, password]
              properties:
                email:
                  type: string
                  format: email
                password:
                  type: string
                  minLength: 1
      responses:
        '200':
          description: Successful login
          content:
            application/json:
              schema:
                type: object
                properties:
                  user:
                    $ref: '#/components/schemas/User'
        '400':
          description: Validation failed
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /auth/logout:
    post:
      summary: End user session
      tags: [Authentication]
      security:
        - cookieAuth: []
          csrfToken: []
      responses:
        '200':
          description: Successfully logged out
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean

  /auth/me:
    get:
      summary: Get current user
      tags: [Authentication]
      security:
        - cookieAuth: []
      responses:
        '200':
          description: User info or null
          content:
            application/json:
              schema:
                type: object
                properties:
                  user:
                    $ref: '#/components/schemas/User'
                    nullable: true

  /dashboard/stats:
    get:
      summary: Get dashboard statistics
      tags: [Dashboard]
      security:
        - cookieAuth: []
      responses:
        '200':
          description: Dashboard stats
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DashboardStats'

  /alerts:
    get:
      summary: List alerts
      tags: [Alerts]
      security:
        - cookieAuth: []
      parameters:
        - name: type
          in: query
          schema:
            type: string
            enum: [threshold_breach, low_velocity, out_of_stock]
        - name: limit
          in: query
          schema:
            type: integer
            default: 100
      responses:
        '200':
          description: List of alerts
          content:
            application/json:
              schema:
                type: object
                properties:
                  alerts:
                    type: array
                    items:
                      $ref: '#/components/schemas/Alert'
                  total:
                    type: integer

  /alerts/{id}/dismiss:
    post:
      summary: Dismiss an alert
      tags: [Alerts]
      security:
        - cookieAuth: []
          csrfToken: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Alert dismissed
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
        '404':
          description: Alert not found

  /products:
    get:
      summary: List products
      tags: [Products]
      security:
        - cookieAuth: []
      responses:
        '200':
          description: List of products
          content:
            application/json:
              schema:
                type: object
                properties:
                  products:
                    type: array
                    items:
                      $ref: '#/components/schemas/Product'
                  total:
                    type: integer

  /products/{id}:
    get:
      summary: Get product details
      tags: [Products]
      security:
        - cookieAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Product details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Product'
        '404':
          description: Product not found

  /thresholds:
    get:
      summary: List thresholds
      tags: [Thresholds]
      security:
        - cookieAuth: []
      responses:
        '200':
          description: List of thresholds
          content:
            application/json:
              schema:
                type: object
                properties:
                  thresholds:
                    type: array
                    items:
                      $ref: '#/components/schemas/Threshold'
                  total:
                    type: integer
    post:
      summary: Create threshold
      tags: [Thresholds]
      security:
        - cookieAuth: []
          csrfToken: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [productId, minQuantity]
              properties:
                productId:
                  type: string
                minQuantity:
                  type: integer
                  minimum: 0
      responses:
        '201':
          description: Threshold created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Threshold'
        '400':
          description: Validation failed

  /thresholds/{id}:
    put:
      summary: Update threshold
      tags: [Thresholds]
      security:
        - cookieAuth: []
          csrfToken: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [minQuantity]
              properties:
                minQuantity:
                  type: integer
                  minimum: 0
      responses:
        '200':
          description: Threshold updated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Threshold'
        '404':
          description: Threshold not found
    delete:
      summary: Delete threshold
      tags: [Thresholds]
      security:
        - cookieAuth: []
          csrfToken: []
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '204':
          description: Threshold deleted
        '404':
          description: Threshold not found

  /settings:
    get:
      summary: Get settings
      tags: [Settings]
      security:
        - cookieAuth: []
      responses:
        '200':
          description: User settings
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Settings'
    put:
      summary: Update settings
      tags: [Settings]
      security:
        - cookieAuth: []
          csrfToken: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                companyName:
                  type: string
                email:
                  type: string
                  format: email
                emailNotifications:
                  type: boolean
                notificationEmail:
                  type: string
                  format: email
                syncFrequency:
                  type: string
                  enum: [hourly, daily, weekly]
                digestFrequency:
                  type: string
                  enum: [daily, weekly, none]
      responses:
        '200':
          description: Settings updated
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Settings'
        '400':
          description: Validation failed

  /billing/checkout:
    post:
      summary: Create checkout session
      tags: [Billing]
      security:
        - cookieAuth: []
          csrfToken: []
      responses:
        '200':
          description: Checkout URL
          content:
            application/json:
              schema:
                type: object
                properties:
                  url:
                    type: string
                    format: uri
        '400':
          description: Already subscribed
        '401':
          description: Unauthorized

  /billing/portal:
    post:
      summary: Create portal session
      tags: [Billing]
      security:
        - cookieAuth: []
          csrfToken: []
      responses:
        '200':
          description: Portal URL
          content:
            application/json:
              schema:
                type: object
                properties:
                  url:
                    type: string
                    format: uri
        '400':
          description: No active subscription
        '401':
          description: Unauthorized

  /sync/trigger:
    post:
      summary: Trigger stock sync
      tags: [Sync]
      security:
        - cookieAuth: []
          csrfToken: []
      responses:
        '200':
          description: Sync results
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                  productsUpdated:
                    type: integer
                  alertsGenerated:
                    type: integer
                  duration:
                    type: integer
                  error:
                    type: string
        '401':
          description: Unauthorized
        '500':
          description: Sync failed

  /webhooks/mercadopago:
    post:
      summary: Handle MercadoPago webhooks
      tags: [Webhooks]
      parameters:
        - name: x-signature
          in: header
          required: true
          schema:
            type: string
          description: MercadoPago HMAC signature (ts=xxx,v1=xxx)
        - name: x-request-id
          in: header
          required: true
          schema:
            type: string
          description: Unique request identifier
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                type:
                  type: string
                data:
                  type: object
                  properties:
                    id:
                      type: string
      responses:
        '200':
          description: Webhook received
          content:
            application/json:
              schema:
                type: object
                properties:
                  received:
                    type: boolean
        '400':
          description: Missing headers or invalid payload
        '401':
          description: Invalid signature
```
