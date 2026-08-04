---
type: "Reference"
title: "API Reference"
openwiki_generated: true
---

# API Reference

This document covers the modular Express/TypeScript API structure, endpoint specifications, and standard request/response formats for the `artisansApp_backend` application.

## Modular Route Architecture
The entry point of the server is [server.ts](file:///c:/Users/user/Downloads/FinalYearProject/artisansApp_backend/src/server.ts), which initializes [app.ts](file:///c:/Users/user/Downloads/FinalYearProject/artisansApp_backend/src/app.ts).
Routes are modularized under the [src/routes](file:///c:/Users/user/Downloads/FinalYearProject/artisansApp_backend/src/routes) directory and mounted centrally in [index.ts](file:///c:/Users/user/Downloads/FinalYearProject/artisansApp_backend/src/routes/index.ts).

### Global Middleware Stack
All routes leverage:
- **Helmet**: Express security headers.
- **CORS**: Configured for specified origin requests.
- **Express JSON Parser**: Parsing JSON request bodies.
- **Global Error Handler**: Catches all unhandled controller exceptions and processes standardized error payloads.

---

## Standard Communication Formats

### Successful Response Format
All successful responses return HTTP status code `200` or `201` with a JSON payload of the following shape:
```json
{
  "success": true,
  "data": {
    // Controller-specific data payload
  }
}
```

### Error Response Format
Error responses default to appropriate HTTP status codes (e.g. `400` Bad Request, `401` Unauthorized, `403` Forbidden, `404` Not Found, `500` Server Error) and return the following JSON shape:
```json
{
  "error": "Human-readable description of what went wrong",
  "code": "ERR_SPECIFIC_SYSTEM_CODE"
}
```

---

## API Endpoints List

### 1. Profiles (`/api/profiles`)
Manages artisan/client profiles, status tracking, and FCM registration.

- **`POST /api/profiles`**
  - **Auth**: Required ✅
  - **Description**: Creates a user profile matching their Supabase Auth details.
- **`GET /api/profiles/me`**
  - **Auth**: Required ✅
  - **Description**: Retrieves the logged-in user's profile information, automatically joining worker metadata if the user has a worker profile.
- **`PUT /api/profiles/me`**
  - **Auth**: Required ✅
  - **Description**: Updates profile details (name, phone, avatar path, etc.).
- **`PUT /api/profiles/me/fcm-token`**
  - **Auth**: Required ✅
  - **Description**: Registers or updates the user's Firebase Cloud Messaging (FCM) token for push notifications.

### 2. Categories (`/api/categories`)
Exposes service categories and rates.

- **`GET /api/categories`**
  - **Auth**: None ❌
  - **Description**: Lists all active categories, service catalog items, and subcategory-specific base fees.

### 3. Jobs (`/api/jobs`)
Manages customer booking requests, matching, and completion flow.

- **`POST /api/jobs/create`**
  - **Auth**: Required ✅
  - **Description**: Creates a new job posting with coordinates, description, category, and target/flat pricing rules.
- **`GET /api/jobs/mine`**
  - **Auth**: Required ✅
  - **Description**: Lists jobs created by or assigned to the authenticated user.
- **`GET /api/jobs/:id`**
  - **Auth**: Required ✅
  - **Description**: Retrieves detailed information for a specific job post.
- **`POST /api/jobs/:id/cancel`**
  - **Auth**: Required ✅
  - **Description**: Cancels an active or pending job post.
- **`POST /api/jobs/:id/complete`**
  - **Auth**: Required ✅
  - **Description**: Marks the job as completed (usually triggered by client confirmation or worker claim).

### 4. Workers (`/api/workers`)
Handles artisan location tracking, dispatch notifications, and job bookings.

- **`PUT /api/workers/location`**
  - **Auth**: Required ✅
  - **Description**: Updates the worker's current GPS longitude and latitude for proximity dispatching.
- **`PUT /api/workers/availability`**
  - **Auth**: Required ✅
  - **Description**: Toggles whether the worker is online and accepting job requests (`is_available`).
- **`GET /api/workers/nearby`**
  - **Auth**: Required ✅
  - **Description**: Queries available workers within proximity range of coordinates.
- **`POST /api/workers/accept/:jobId`**
  - **Auth**: Required ✅
  - **Description**: Accepts a job offer, verifying availability and matching invariants.
- **`POST /api/workers/decline/:jobId`**
  - **Auth**: Required ✅
  - **Description**: Declines a job dispatch offer.
- **`PUT /api/workers/me/profile`**
  - **Auth**: Required ✅
  - **Description**: Updates worker specialization, certifications, hourly rates, and service areas.
- **`GET /api/workers/me/active-job`**
  - **Auth**: Required ✅
  - **Description**: Returns the active job details currently assigned to the artisan.
- **`POST /api/workers/:jobId/start`**
  - **Auth**: Required ✅
  - **Description**: Transitions a job from accepted to start state (job in-progress).
- **`GET /api/workers/me/history`**
  - **Auth**: Required ✅
  - **Description**: Retrieves history of completed jobs for this worker.

### 5. Chat (`/api/conversations`)
Supports real-time chat between clients and artisans.

- **`GET /api/conversations`**
  - **Auth**: Required ✅
  - **Description**: Lists conversations and active threads for the user.
- **`GET /api/conversations/:id/messages`**
  - **Auth**: Required ✅
  - **Description**: Retrieves message history for the selected conversation ID.
- **`POST /api/conversations/:id/messages`**
  - **Auth**: Required ✅
  - **Description**: Sends a message into the conversation (validates sender profile).

### 6. Reviews (`/api/reviews`)
Manages trust metrics and rating submissions.

- **`POST /api/reviews`**
  - **Auth**: Required ✅
  - **Description**: Submits a rating and written review for a completed job.
- **`GET /api/reviews/worker/:workerId`**
  - **Auth**: None ❌
  - **Description**: Fetches list of reviews and computed statistics for the designated worker.
