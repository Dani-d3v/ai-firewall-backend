# Frontend API

Base URL:

```text
https://ai-firewall-backend-dani-d3v8671-ooua5n91.leapcell.dev
```

Common headers:

```http
Content-Type: application/json
Authorization: Bearer <token>
```

Notes:

- Only protected routes need the `Authorization` header.
- All successful responses follow this shape:

```json
{
  "success": true,
  "data": {},
  "message": "optional"
}
```

- Error responses follow this shape:

```json
{
  "success": false,
  "message": "Error message"
}
```

## 1. Auth

### 1.1 Request registration OTP

Endpoint:

```http
POST /api/auth/register/request-otp
```

Headers:

```http
Content-Type: application/json
```

Body:

```json
{
  "name": "Daniel",
  "email": "daniel@example.com",
  "password": "secret123"
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "email": "daniel@example.com",
    "expiresAt": "2026-03-24T12:00:00.000Z"
  },
  "message": "OTP sent to email"
}
```

### 1.2 Register with OTP

Endpoint:

```http
POST /api/auth/register
```

Headers:

```http
Content-Type: application/json
```

Body:

```json
{
  "email": "daniel@example.com",
  "otp": "123456"
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "_id": "USER_ID",
    "name": "Daniel",
    "email": "daniel@example.com",
    "token": "JWT_TOKEN",
    "tokenExpiresAt": "2026-03-31T12:00:00.000Z"
  }
}
```

### 1.3 Login

Endpoint:

```http
POST /api/auth/login
```

Headers:

```http
Content-Type: application/json
```

Body:

```json
{
  "email": "daniel@example.com",
  "password": "secret123"
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "_id": "USER_ID",
    "name": "Daniel",
    "email": "daniel@example.com",
    "token": "JWT_TOKEN",
    "tokenExpiresAt": "2026-03-31T12:00:00.000Z"
  }
}
```

### 1.4 Forgot password

Endpoint:

```http
POST /api/auth/forgot-password
```

Headers:

```http
Content-Type: application/json
```

Body:

```json
{
  "email": "daniel@example.com"
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "email": "daniel@example.com",
    "expiresAt": "2026-03-24T12:00:00.000Z"
  },
  "message": "If an account exists, a reset OTP has been sent"
}
```

### 1.5 Reset password

Endpoint:

```http
POST /api/auth/reset-password
```

Headers:

```http
Content-Type: application/json
```

Body:

```json
{
  "email": "daniel@example.com",
  "otp": "123456",
  "password": "newSecret123"
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "email": "daniel@example.com"
  },
  "message": "Password reset successful"
}
```

## 2. User

### 2.1 Get profile

Endpoint:

```http
GET /api/users/profile
```

Headers:

```http
Authorization: Bearer <token>
```

Body:

```json
{}
```

## 3. Dashboard

### 3.1 Get dashboard summary

Endpoint:

```http
GET /api/dashboard
```

Headers:

```http
Authorization: Bearer <token>
```

Body:

```json
{}
```

## 4. Subscriptions

### 4.1 Get all plans

Endpoint:

```http
GET /api/subscriptions
```

Headers:

```http
Content-Type: application/json
```

### 4.2 Simulate payment

Endpoint:

```http
POST /api/subscriptions/simulate-payment
```

Headers:

```http
Authorization: Bearer <token>
Content-Type: application/json
```

Body:

```json
{
  "planId": "PLAN_ID",
  "paymentMethod": "telebirr"
}
```

### 4.3 Buy plan

Endpoint:

```http
POST /api/subscriptions/buy
```

Headers:

```http
Authorization: Bearer <token>
Content-Type: application/json
```

Body:

```json
{
  "planId": "PLAN_ID",
  "paymentId": "PAYMENT_ID",
  "wireguardPublicKey": "USER_WIREGUARD_PUBKEY"
}
```

### 4.4 Get my current plan

Endpoint:

```http
GET /api/subscriptions/my-plan
```

Headers:

```http
Authorization: Bearer <token>
```

### 4.5 Get subscription history

Endpoint:

```http
GET /api/subscriptions/history
```

Headers:

```http
Authorization: Bearer <token>
```

### 4.6 Cancel current subscription

Endpoint:

```http
PATCH /api/subscriptions/cancel
```

Headers:

```http
Authorization: Bearer <token>
```

Body:

```json
{}
```

### 4.7 Get VPN access state

Endpoint:

```http
GET /api/subscriptions/vpn-access
```

Headers:

```http
Authorization: Bearer <token>
```

Notes:

- Requires an active subscription.
- Returns the assigned internal VPN IP and WireGuard peer state.

### 4.8 Download WireGuard config template

Endpoint:

```http
GET /api/subscriptions/download-config
```

Headers:

```http
Authorization: Bearer <token>
```

Notes:

- Requires an active subscription.
- Response is a `.conf` file template. The client must insert its own private key locally before import.

## 5. Admin subscription APIs

### 5.1 Create plan

Endpoint:

```http
POST /api/subscriptions/create
```

Headers:

```http
Authorization: Bearer <admin_token>
Content-Type: application/json
```

Body:

```json
{
  "name": "Pro",
  "price": 29.99,
  "duration": 30,
  "features": ["Feature 1", "Feature 2"]
}
```

### 5.2 Update plan

Endpoint:

```http
PATCH /api/subscriptions/:planId
```

Headers:

```http
Authorization: Bearer <admin_token>
Content-Type: application/json
```

Body:

```json
{
  "name": "Pro Plus",
  "price": 39.99,
  "duration": 30,
  "features": ["Feature 1", "Feature 2", "Feature 3"]
}
```

### 5.3 Delete plan

Endpoint:

```http
DELETE /api/subscriptions/:planId
```

Headers:

```http
Authorization: Bearer <admin_token>
```

## 6. Frontend flow summary

## 6.1 Dashboard live alerts

Endpoint:

```http
GET /api/dashboard/stream
```

Headers:

```http
Authorization: Bearer <token>
```

Notes:

- This is a Server-Sent Events stream.
- Listen for the `alert` event to show "AI Shield Active" mitigation notices in real time.

## 6.2 Gateway alert webhook

Endpoint:

```http
POST /api/alerts
```

Headers:

```http
Content-Type: application/json
X-Alert-Secret: <ALERT_WEBHOOK_SECRET>
```

Body:

```json
{
  "victim_vpn_ip": "10.0.0.12",
  "attacker_ip": "198.51.100.24"
}
```

## 7. Frontend flow summary

### Register flow

1. Call `POST /api/auth/register/request-otp`
2. Ask user for the 6-digit OTP from email
3. Call `POST /api/auth/register`
4. Save returned `token`
5. Save returned `tokenExpiresAt`

### Login flow

1. Call `POST /api/auth/login`
2. Save returned `token`
3. Save returned `tokenExpiresAt`

### Forgot password flow

1. Call `POST /api/auth/forgot-password`
2. Ask user for the 6-digit OTP from email
3. Call `POST /api/auth/reset-password`

### Protected requests

For every protected endpoint, send:

```http
Authorization: Bearer <token>
```
