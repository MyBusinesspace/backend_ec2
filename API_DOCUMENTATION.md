# CRM Backend API Documentation

**Version:** 1.0.0
**Base URL:** `/api`
**Framework:** Express.js with TypeScript

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Middleware](#middleware)
4. [API Endpoints](#api-endpoints)
   - [Health](#health)
   - [Authentication](#authentication-endpoints)
   - [Company](#company)
   - [Contacts](#contacts)
   - [Projects](#projects)
   - [Teams](#teams)
   - [Orders](#orders)
   - [Tasks](#tasks)
   - [Invitations](#invitations)
   - [Clock Tracking](#clock-tracking)
5. [Error Handling](#error-handling)

---

## Overview

This is a CRM (Customer Relationship Management) backend API built with Express.js, TypeScript, and Prisma ORM. The API provides comprehensive functionality for managing companies, contacts, projects, teams, orders, tasks, and user invitations.

### Technology Stack
- **Framework:** Express.js
- **Language:** TypeScript
- **ORM:** Prisma
- **Authentication:** JWT (JSON Web Tokens) + Google OAuth
- **Security:** Helmet, CORS
- **Documentation:** Swagger/OpenAPI

---

## Authentication

The API uses **JWT (JSON Web Tokens)** for authentication and supports **Google OAuth 2.0** for user login.

### Authentication Flow

1. **Web OAuth Flow:**
   - User initiates login via `/api/auth/google`
   - User is redirected to Google authentication
   - Google redirects to `/api/auth/google/callback` with authentication result
   - JWT token is issued and returned to the frontend

2. **Mobile OAuth Flow:**
   - User authenticates with Google on mobile device
   - Mobile app sends Google ID token to `/api/auth/google/mobile`
   - Backend validates token and returns JWT

### Token Format

All authenticated requests must include the JWT token in the `Authorization` header:

```
Authorization: Bearer <your_jwt_token>
```

---

## Middleware

The API uses several middleware layers for security, logging, and access control:

### Global Middleware

| Middleware | Description | Applied To |
|------------|-------------|------------|
| `helmet` | Security headers | All routes |
| `cors` | Cross-Origin Resource Sharing | All routes |
| `express.json` | JSON body parsing | All routes |
| `express.urlencoded` | URL-encoded body parsing | All routes |
| `requestLogger` | HTTP request logging | All routes |
| `errorHandler` | Global error handler | All routes |
| `notFoundHandler` | 404 handler for undefined routes | All routes |

### Route-Specific Middleware

#### `authenticateJWT`
**Purpose:** Validates JWT token and attaches user information to the request.

**Location:** `src/core/middleware/authenticate.ts`

**Applied To:** All protected routes (most endpoints except public ones)

**Functionality:**
- Extracts Bearer token from `Authorization` header
- Verifies token signature and expiration
- Attaches decoded user payload to `req.user`
- Returns 401 Unauthorized if token is invalid or missing

**Error Responses:**
- `401 Unauthorized` - No authorization header provided
- `401 Unauthorized` - Invalid authorization header format
- `401 Unauthorized` - Token verification failed

---

#### `verifyCompanyAccess`
**Purpose:** Ensures the authenticated user has access to the specified company.

**Location:** `src/core/middleware/verifyCompanyAccess.ts`

**Applied To:** All company-scoped routes (companies, projects, contacts, teams, orders, tasks)

**Functionality:**
- Extracts `companyId` from route params, body, or query
- Queries database to verify user belongs to the company
- Attaches `companyId` to request for downstream use
- Returns 403 Forbidden if user doesn't have access

**Error Responses:**
- `403 Forbidden` - User not authenticated
- `400 Bad Request` - Company ID is required
- `403 Forbidden` - You do not have access to this company

**Prerequisites:** Must be used after `authenticateJWT` middleware

---

#### `optionalAuth`
**Purpose:** Optionally validates JWT token if present, but doesn't fail if missing.

**Location:** `src/core/middleware/authenticate.ts`

**Applied To:** Routes that can work with or without authentication

**Functionality:**
- Attempts to extract and verify Bearer token
- Attaches user to request if valid token is present
- Continues without error if no token or invalid token

---

## API Endpoints

---

### Health

Health check endpoints for monitoring API status.

#### `GET /api/health`

Check API health status and database connection.

**Authentication:** None

**Middleware:** None

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-02-06T10:30:00.000Z",
  "database": "connected"
}
```

---

### Authentication Endpoints

Endpoints for user authentication and session management.

---

#### `GET /api/auth/google`

Initiate Google OAuth authentication flow.

**Authentication:** None

**Middleware:**
- `passport.authenticate('google')` - Initiates OAuth flow with Google

**Query Parameters:** None

**Response:** Redirects to Google authentication page

**Scope:** `profile`, `email`

---

#### `POST /api/auth/google/mobile`

Exchange Google ID Token for JWT (Mobile authentication).

**Authentication:** None

**Middleware:** None

**Request Body:**
```json
{
  "idToken": "string"
}
```

**Response:**
```json
{
  "success": true,
  "token": "jwt_token_here",
  "user": {
    "id": "string",
    "email": "string",
    "name": "string"
  }
}
```

---

#### `GET /api/auth/google/callback`

Google OAuth callback endpoint.

**Authentication:** Google OAuth

**Middleware:**
- `passport.authenticate('google')` - Handles OAuth callback

**Response:** Redirects to frontend with JWT token in query parameters

**Failure Redirect:** `/api/auth/failure`

---

#### `GET /api/auth/failure`

Authentication failure endpoint.

**Authentication:** None

**Middleware:** None

**Response:**
```json
{
  "success": false,
  "message": "Authentication failed"
}
```

**Status Code:** 401

---

#### `GET /api/auth/me`

Get current authenticated user information.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "string",
    "email": "string",
    "name": "string",
    "companies": [
      {
        "id": "string",
        "name": "string",
        "role": "string"
      }
    ]
  }
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated or invalid token

---

#### `POST /api/auth/logout`

Logout user session.

**Authentication:** None

**Middleware:** None

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### Company

Endpoints for managing companies and company users.

---

#### `GET /api/companies/:companyId`

Get company details.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID

**Response:**
```json
{
  "id": "string",
  "name": "string",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `404 Not Found` - Company not found

---

#### `GET /api/companies/:companyId/users`

Get all users in a company.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID

**Response:**
```json
[
  {
    "id": "string",
    "email": "string",
    "name": "string",
    "role": "string",
    "joinedAt": "timestamp"
  }
]
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company

---

#### `GET /api/companies/:companyId/users/search`

Search users in a company.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID

**Query Parameters:**
- `q` (string, optional) - Search query

**Response:**
```json
[
  {
    "id": "string",
    "email": "string",
    "name": "string",
    "role": "string"
  }
]
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company

---

### Contacts

Endpoints for managing company contacts.

---

#### `GET /api/companies/:companyId/contacts`

Get all contacts for a company.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID

**Response:**
```json
[
  {
    "id": "string",
    "name": "string",
    "email": "string",
    "phone": "string",
    "company": "string",
    "position": "string",
    "isActive": true,
    "createdAt": "timestamp",
    "updatedAt": "timestamp"
  }
]
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company

---

#### `GET /api/companies/:companyId/contacts/:contactId`

Get a specific contact by ID.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID
- `contactId` (string, required) - Contact ID

**Response:**
```json
{
  "id": "string",
  "name": "string",
  "email": "string",
  "phone": "string",
  "company": "string",
  "position": "string",
  "isActive": true,
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `404 Not Found` - Contact not found

---

#### `POST /api/companies/:companyId/contacts`

Create a new contact.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID

**Request Body:**
```json
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "company": "string",
  "position": "string"
}
```

**Response:**
```json
{
  "id": "string",
  "name": "string",
  "email": "string",
  "phone": "string",
  "company": "string",
  "position": "string",
  "isActive": true,
  "createdAt": "timestamp"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `400 Bad Request` - Invalid request body

---

#### `PUT /api/companies/:companyId/contacts/:contactId`

Update a contact.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID
- `contactId` (string, required) - Contact ID

**Request Body:**
```json
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "company": "string",
  "position": "string"
}
```

**Response:**
```json
{
  "id": "string",
  "name": "string",
  "email": "string",
  "phone": "string",
  "company": "string",
  "position": "string",
  "isActive": true,
  "updatedAt": "timestamp"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `404 Not Found` - Contact not found

---

#### `PATCH /api/companies/:companyId/contacts/:contactId/deactivate`

Deactivate a contact (soft delete).

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID
- `contactId` (string, required) - Contact ID

**Response:**
```json
{
  "id": "string",
  "isActive": false,
  "updatedAt": "timestamp"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `404 Not Found` - Contact not found

---

#### `DELETE /api/companies/:companyId/contacts/:contactId`

Permanently delete a contact.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID
- `contactId` (string, required) - Contact ID

**Response:**
```json
{
  "success": true,
  "message": "Contact deleted successfully"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `404 Not Found` - Contact not found

---

### Projects

Endpoints for managing company projects.

---

#### `GET /api/companies/:companyId/projects`

Get all projects for a company.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID

**Response:**
```json
[
  {
    "id": "string",
    "name": "string",
    "description": "string",
    "status": "string",
    "startDate": "timestamp",
    "endDate": "timestamp",
    "createdAt": "timestamp",
    "updatedAt": "timestamp"
  }
]
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company

---

#### `GET /api/companies/:companyId/projects/:projectId`

Get a specific project by ID.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID
- `projectId` (string, required) - Project ID

**Response:**
```json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "status": "string",
  "startDate": "timestamp",
  "endDate": "timestamp",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `404 Not Found` - Project not found

---

#### `POST /api/companies/:companyId/projects`

Create a new project.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID

**Request Body:**
```json
{
  "name": "string",
  "description": "string",
  "status": "string",
  "startDate": "timestamp",
  "endDate": "timestamp"
}
```

**Response:**
```json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "status": "string",
  "startDate": "timestamp",
  "endDate": "timestamp",
  "createdAt": "timestamp"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `400 Bad Request` - Invalid request body

---

#### `PUT /api/companies/:companyId/projects/:projectId`

Update a project.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID
- `projectId` (string, required) - Project ID

**Request Body:**
```json
{
  "name": "string",
  "description": "string",
  "status": "string",
  "startDate": "timestamp",
  "endDate": "timestamp"
}
```

**Response:**
```json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "status": "string",
  "startDate": "timestamp",
  "endDate": "timestamp",
  "updatedAt": "timestamp"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `404 Not Found` - Project not found

---

#### `DELETE /api/companies/:companyId/projects/:projectId`

Delete a project.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID
- `projectId` (string, required) - Project ID

**Response:**
```json
{
  "success": true,
  "message": "Project deleted successfully"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `404 Not Found` - Project not found

---

### Teams

Endpoints for managing company teams and team members.

---

#### `GET /api/companies/:companyId/teams`

Get all teams for a company.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID

**Response:**
```json
[
  {
    "id": "string",
    "name": "string",
    "description": "string",
    "memberCount": 5,
    "createdAt": "timestamp",
    "updatedAt": "timestamp"
  }
]
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company

---

#### `GET /api/companies/:companyId/teams/:teamId`

Get a specific team by ID.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID
- `teamId` (string, required) - Team ID

**Response:**
```json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "members": [
    {
      "userId": "string",
      "name": "string",
      "email": "string",
      "role": "string"
    }
  ],
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `404 Not Found` - Team not found

---

#### `POST /api/companies/:companyId/teams`

Create a new team.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID

**Request Body:**
```json
{
  "name": "string",
  "description": "string"
}
```

**Response:**
```json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "createdAt": "timestamp"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `400 Bad Request` - Invalid request body

---

#### `PATCH /api/companies/:companyId/teams/:teamId`

Update a team.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID
- `teamId` (string, required) - Team ID

**Request Body:**
```json
{
  "name": "string",
  "description": "string"
}
```

**Response:**
```json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "updatedAt": "timestamp"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `404 Not Found` - Team not found

---

#### `DELETE /api/companies/:companyId/teams/:teamId`

Delete a team.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID
- `teamId` (string, required) - Team ID

**Response:**
```json
{
  "success": true,
  "message": "Team deleted successfully"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `404 Not Found` - Team not found

---

#### `POST /api/companies/:companyId/teams/:teamId/users`

Add a user to a team.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID
- `teamId` (string, required) - Team ID

**Request Body:**
```json
{
  "userId": "string"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User added to team successfully"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `404 Not Found` - Team or user not found
- `409 Conflict` - User already in team

---

#### `DELETE /api/companies/:companyId/teams/:teamId/users/:userId`

Remove a user from a team.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID
- `teamId` (string, required) - Team ID
- `userId` (string, required) - User ID

**Response:**
```json
{
  "success": true,
  "message": "User removed from team successfully"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `404 Not Found` - Team or user not found

---

### Orders

Endpoints for managing company orders (working orders).

---

#### `GET /api/companies/:companyId/orders`

Get all orders for a company.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID

**Response:**
```json
[
  {
    "id": "string",
    "projectId": "string",
    "orderNumber": "string",
    "status": "string",
    "totalAmount": 0,
    "createdAt": "timestamp",
    "updatedAt": "timestamp"
  }
]
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company

---

#### `GET /api/companies/:companyId/projects/:projectId/orders`

Get all orders for a specific project.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID
- `projectId` (string, required) - Project ID

**Response:**
```json
[
  {
    "id": "string",
    "projectId": "string",
    "orderNumber": "string",
    "status": "string",
    "totalAmount": 0,
    "createdAt": "timestamp",
    "updatedAt": "timestamp"
  }
]
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `404 Not Found` - Project not found

---

#### `GET /api/companies/:companyId/orders/:orderId`

Get a specific order by ID.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID
- `orderId` (string, required) - Order ID

**Response:**
```json
{
  "id": "string",
  "projectId": "string",
  "orderNumber": "string",
  "status": "string",
  "totalAmount": 0,
  "items": [],
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `404 Not Found` - Order not found

---

#### `POST /api/companies/:companyId/projects/:projectId/orders`

Create a new order for a project.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID
- `projectId` (string, required) - Project ID

**Request Body:**
```json
{
  "orderNumber": "string",
  "status": "string",
  "totalAmount": 0,
  "items": []
}
```

**Response:**
```json
{
  "id": "string",
  "projectId": "string",
  "orderNumber": "string",
  "status": "string",
  "totalAmount": 0,
  "createdAt": "timestamp"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `404 Not Found` - Project not found
- `400 Bad Request` - Invalid request body

---

#### `PATCH /api/companies/:companyId/orders/:orderId`

Update an order.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID
- `orderId` (string, required) - Order ID

**Request Body:**
```json
{
  "orderNumber": "string",
  "status": "string",
  "totalAmount": 0
}
```

**Response:**
```json
{
  "id": "string",
  "orderNumber": "string",
  "status": "string",
  "totalAmount": 0,
  "updatedAt": "timestamp"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `404 Not Found` - Order not found

---

#### `DELETE /api/companies/:companyId/orders/:orderId`

Delete an order.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID
- `orderId` (string, required) - Order ID

**Response:**
```json
{
  "success": true,
  "message": "Order deleted successfully"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `404 Not Found` - Order not found

---

### Tasks

Endpoints for managing job orders and tasks.

---

#### `GET /api/companies/:companyId/tasks`

Get all tasks for a company.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID

**Response:**
```json
[
  {
    "id": "string",
    "title": "string",
    "description": "string",
    "status": "string",
    "priority": "string",
    "assignedTo": "string",
    "dueDate": "timestamp",
    "createdAt": "timestamp",
    "updatedAt": "timestamp"
  }
]
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company

---

#### `GET /api/companies/:companyId/tasks/:taskId`

Get a specific task by ID.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID
- `taskId` (string, required) - Task ID

**Response:**
```json
{
  "id": "string",
  "title": "string",
  "description": "string",
  "status": "string",
  "priority": "string",
  "assignedTo": "string",
  "dueDate": "timestamp",
  "instructions": "string",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `404 Not Found` - Task not found

---

#### `GET /api/companies/:companyId/orders/:workingOrderId/task-details`

Get task details for a specific working order.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID
- `workingOrderId` (string, required) - Working Order ID

**Response:**
```json
{
  "orderId": "string",
  "tasks": [
    {
      "id": "string",
      "title": "string",
      "status": "string",
      "priority": "string"
    }
  ]
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `404 Not Found` - Order not found

---

#### `POST /api/companies/:companyId/job-orders`

Create a new job order (creates order with associated tasks).

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID

**Request Body:**
```json
{
  "projectId": "string",
  "orderNumber": "string",
  "tasks": [
    {
      "title": "string",
      "description": "string",
      "priority": "string",
      "dueDate": "timestamp"
    }
  ]
}
```

**Response:**
```json
{
  "id": "string",
  "orderNumber": "string",
  "projectId": "string",
  "tasks": [
    {
      "id": "string",
      "title": "string",
      "status": "string"
    }
  ],
  "createdAt": "timestamp"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `400 Bad Request` - Invalid request body

---

#### `PATCH /api/companies/:companyId/tasks/:taskId/status`

Update task status.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID
- `taskId` (string, required) - Task ID

**Request Body:**
```json
{
  "status": "string"
}
```

**Response:**
```json
{
  "id": "string",
  "status": "string",
  "updatedAt": "timestamp"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `404 Not Found` - Task not found
- `400 Bad Request` - Invalid status

---

#### `PATCH /api/companies/:companyId/tasks/:taskId/instructions`

Update task instructions.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID
- `taskId` (string, required) - Task ID

**Request Body:**
```json
{
  "instructions": "string"
}
```

**Response:**
```json
{
  "id": "string",
  "instructions": "string",
  "updatedAt": "timestamp"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `404 Not Found` - Task not found

---

### Invitations

Endpoints for managing company invitations.

---

#### `GET /api/companies/invitations/:code/validate`

Validate an invitation code (public endpoint).

**Authentication:** None

**Middleware:** None

**URL Parameters:**
- `code` (string, required) - Invitation code

**Response:**
```json
{
  "valid": true,
  "company": {
    "id": "string",
    "name": "string"
  },
  "expiresAt": "timestamp"
}
```

**Error Responses:**
- `404 Not Found` - Invalid or expired invitation code

---

#### `POST /api/companies/invitations/:code/use`

Use an invitation code to join a company.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`

**URL Parameters:**
- `code` (string, required) - Invitation code

**Response:**
```json
{
  "success": true,
  "company": {
    "id": "string",
    "name": "string"
  },
  "role": "string"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `404 Not Found` - Invalid or expired invitation code
- `409 Conflict` - User already member of company

---

#### `GET /api/companies/:companyId/invitations`

Get all invitations for a company.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID

**Response:**
```json
[
  {
    "id": "string",
    "code": "string",
    "email": "string",
    "role": "string",
    "expiresAt": "timestamp",
    "usedAt": "timestamp",
    "createdAt": "timestamp"
  }
]
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company

---

#### `POST /api/companies/:companyId/invitations`

Create a new invitation.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID

**Request Body:**
```json
{
  "email": "string",
  "role": "string",
  "expiresInDays": 7
}
```

**Response:**
```json
{
  "id": "string",
  "code": "string",
  "email": "string",
  "role": "string",
  "expiresAt": "timestamp",
  "invitationUrl": "string"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `400 Bad Request` - Invalid request body

---

#### `DELETE /api/companies/:companyId/invitations/:id`

Delete/revoke an invitation.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID
- `id` (string, required) - Invitation ID

**Response:**
```json
{
  "success": true,
  "message": "Invitation deleted successfully"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `404 Not Found` - Invitation not found

---

### Clock Tracking

Endpoints for tracking worker time with GPS location monitoring.

---

#### `POST /api/companies/:companyId/clock/in`

Clock in to start working on a task.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID

**Request Body:**
```json
{
  "taskId": "string",
  "location": {
    "latitude": 40.7128,
    "longitude": -74.0060,
    "accuracy": 5.0,
    "altitude": 10.5,
    "speed": 0.0,
    "heading": 180.0
  },
  "address": "123 Main St, New York, NY",
  "notes": "Starting work on site"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "string",
    "companyId": "string",
    "userId": "string",
    "taskId": "string",
    "clockInTime": "timestamp",
    "clockInLat": 40.7128,
    "clockInLng": -74.0060,
    "clockInAddress": "string",
    "isActive": true,
    "task": {
      "id": "string",
      "taskDetailTitle": "string",
      "categoryName": "string",
      "status": "string"
    }
  },
  "message": "Clocked in successfully"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `400 Bad Request` - Already clocked in or not assigned to task

---

#### `POST /api/companies/:companyId/clock/out`

Clock out to stop working on current task.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID

**Request Body:**
```json
{
  "location": {
    "latitude": 40.7130,
    "longitude": -74.0062,
    "accuracy": 5.0
  },
  "address": "123 Main St, New York, NY",
  "notes": "Work completed"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "string",
    "clockInTime": "timestamp",
    "clockOutTime": "timestamp",
    "durationMinutes": 255,
    "task": {},
    "user": {},
    "locationHistory": []
  },
  "message": "Clocked out successfully"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `400 Bad Request` - No active clock entry found

---

#### `POST /api/companies/:companyId/clock/location`

Update GPS location while clocked in.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID

**Request Body:**
```json
{
  "clockEntryId": "string",
  "latitude": 40.7129,
  "longitude": -74.0061,
  "accuracy": 5.0,
  "altitude": 11.2,
  "speed": 0.5,
  "heading": 90.0,
  "address": "string"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "string",
    "clockEntryId": "string",
    "latitude": 40.7129,
    "longitude": -74.0061,
    "timestamp": "timestamp"
  }
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `400 Bad Request` - Invalid location data
- `404 Not Found` - Clock entry not found or not active

---

#### `GET /api/companies/:companyId/clock/active`

Get current active clock entry for authenticated user.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID

**Response:**
```json
{
  "success": true,
  "data": {
    "hasActiveClock": true,
    "activeClock": {
      "id": "string",
      "clockInTime": "timestamp",
      "task": {},
      "locationHistory": []
    }
  }
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated

---

#### `GET /api/companies/:companyId/clock/entries`

Get clock entries with filters.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID

**Query Parameters:**
- `userId` (string, optional) - Filter by user
- `taskId` (string, optional) - Filter by task
- `startDate` (string, optional) - Filter entries after date (ISO 8601)
- `endDate` (string, optional) - Filter entries before date (ISO 8601)
- `isActive` (boolean, optional) - Filter by active status

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "clockInTime": "timestamp",
      "clockOutTime": "timestamp",
      "durationMinutes": 255,
      "task": {},
      "user": {},
      "locationHistory": []
    }
  ],
  "count": 1
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company

---

#### `GET /api/companies/:companyId/clock/entries/:entryId`

Get a specific clock entry by ID.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID
- `entryId` (string, required) - Clock entry ID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "string",
    "clockInTime": "timestamp",
    "clockOutTime": "timestamp",
    "durationMinutes": 255,
    "task": {},
    "user": {},
    "locationHistory": []
  }
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `404 Not Found` - Clock entry not found

---

#### `GET /api/companies/:companyId/clock/summary`

Get time summary for payroll and reporting.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID

**Query Parameters:**
- `startDate` (string, required) - Start date (ISO 8601)
- `endDate` (string, required) - End date (ISO 8601)
- `userId` (string, optional) - Filter by user

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "userId": "string",
      "userName": "string",
      "totalMinutes": 1200,
      "totalHours": 20.0,
      "entriesCount": 5,
      "taskBreakdown": [
        {
          "taskId": "string",
          "taskTitle": "string",
          "minutes": 720,
          "hours": 12.0
        }
      ]
    }
  ]
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company
- `400 Bad Request` - Missing required dates

---

#### `GET /api/companies/:companyId/clock/entries/:entryId/locations`

Get GPS location history for a clock entry.

**Authentication:** Required (JWT)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID
- `entryId` (string, required) - Clock entry ID

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "latitude": 40.7128,
      "longitude": -74.0060,
      "accuracy": 5.0,
      "timestamp": "timestamp",
      "address": "string"
    }
  ],
  "count": 1
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access to this company

---

#### `POST /api/companies/:companyId/clock/force-out/:userId`

Admin: Force clock out a user (emergency situations).

**Authentication:** Required (JWT + Admin)

**Middleware:**
- `authenticateJWT`
- `verifyCompanyAccess`

**URL Parameters:**
- `companyId` (string, required) - Company ID
- `userId` (string, required) - User ID to force clock out

**Request Body:**
```json
{
  "notes": "Emergency clock out - worker called in sick"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "string",
    "clockOutTime": "timestamp",
    "durationMinutes": 270
  },
  "message": "User clocked out successfully"
}
```

**Error Responses:**
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - No access or insufficient permissions
- `404 Not Found` - No active clock entry found

---

## Error Handling

The API uses consistent error responses across all endpoints.

### Standard Error Response Format

```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE",
    "statusCode": 400
  }
}
```

### Common HTTP Status Codes

| Status Code | Description |
|-------------|-------------|
| `200 OK` | Request successful |
| `201 Created` | Resource created successfully |
| `400 Bad Request` | Invalid request body or parameters |
| `401 Unauthorized` | Authentication required or token invalid |
| `403 Forbidden` | User doesn't have permission to access resource |
| `404 Not Found` | Resource not found |
| `409 Conflict` | Resource conflict (e.g., duplicate entry) |
| `500 Internal Server Error` | Server error |

### Error Types

#### Authentication Errors (401)
- No authorization header provided
- Invalid authorization header format
- Token verification failed
- Token expired

#### Authorization Errors (403)
- User not authenticated
- You do not have access to this company
- Insufficient permissions

#### Validation Errors (400)
- Invalid request body
- Missing required fields
- Invalid field format
- Company ID is required

#### Not Found Errors (404)
- Resource not found
- Company not found
- Project not found
- Contact not found
- Team not found
- Order not found
- Task not found
- Invitation not found

---

## Additional Information

### Swagger Documentation

Interactive API documentation is available at `/api-docs` when the server is running.

### Environment Variables

Required environment variables:
- `FRONTEND_URL` - Frontend application URL for CORS
- `JWT_SECRET` - Secret key for JWT token signing
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `DATABASE_URL` - PostgreSQL database connection string

### Rate Limiting

Currently, no rate limiting is implemented. Consider adding rate limiting middleware for production use.

### Pagination

Most list endpoints do not currently implement pagination. Consider adding pagination for large datasets.

---

**Document Version:** 1.0.0
**Last Updated:** February 6, 2026
**Maintained By:** Backend Development Team
