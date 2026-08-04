---
type: "Reference"
title: "Authentication & Roles"
openwiki_generated: true
---

# Authentication & Roles

This document describes the token verification, middleware configuration, role-based access, and suspension checks within the backend API.

## Token Validation Middleware
Authentication on secured endpoints is enforced by the [authMiddleware](file:///c:/Users/user/Downloads/FinalYearProject/artisansApp_backend/src/middleware/auth.ts). 

### How it works:
1. **Authorization Header**: Checks for the presence of a `Bearer <token>` string in the request's `Authorization` header.
2. **Supabase Authentication**: Extracts the JWT token and verifies it against Supabase Auth using the `supabaseAdmin.auth.getUser(token)` SDK.
3. **Session Enrichment**: If valid, extracts metadata (such as `id`, `role`, `email`, and `phone`) and binds them to the request context under `req.user`.

```typescript
// req.user typing:
interface UserContext {
  id: string;
  role: string | null;
  email: string | null;
  phone: string | null;
}
```

---

## Account Suspension Enforcement
To protect the ecosystem, the authentication middleware executes a live database status check on every validated request:
- Queries the `profiles` table for `account_status` and `suspension_reason`.
- If the status is `suspended`, the request is immediately blocked, returning an HTTP `403 Forbidden` response with the reason:
  ```json
  {
    "error": "Your account has been suspended. <Reason>",
    "code": "ACCOUNT_SUSPENDED"
  }
  ```

---

## Role-Based Controls

The system supports the following user roles defined in Supabase `auth.users` user_metadata:
- **`client`**: Customers requesting services, creating jobs, and writing reviews.
- **`worker`**: Artisans updating locations, toggling availability, accepting dispatches, and starting jobs.
- **`admin`**: System administrators or support agents managing reviews, users, verification requests, and categories.

### Route Protection:
Certain route files enforce role checks on top of the generic auth middleware (for example, `/api/admin/*` routes verify that `req.user.role === 'admin'`).
- Administrative routes and operations are implemented in [src/routes/admin.ts](file:///c:/Users/user/Downloads/FinalYearProject/artisansApp_backend/src/routes/admin.ts).
- Worker-specific state routes are implemented in [src/routes/workers.ts](file:///c:/Users/user/Downloads/FinalYearProject/artisansApp_backend/src/routes/workers.ts).
