# CraftMatch Backend Architecture

This document serves as the definitive current backend documentation for the CraftMatch Express.js backend. It details the existing architecture, standard integration rules, and API endpoint references.

## 1. Modular Architecture & Directory Design

The backend is built with Express.js and structured into modules:

```text
artisansApp_backend/
├── src/
│   ├── config/              # Configuration (env, supabase, firebase)
│   ├── middleware/          # Express middlewares (auth, error handler)
│   ├── constants/           # Enums and constants
│   ├── routes/              # Express routers
│   ├── services/            # Business logic and database interactions
│   ├── validators/          # Zod validation schemas
│   └── utils/               # Utilities (haversine, error handling)
└── supabase/
    ├── migrations/          # Database migrations
    ├── seeds/               # Database seed data
    └── types.ts             # Generated Supabase TypeScript types
```

### Loose Coupling Rules
1. **Isolated Routing Files**: Each module implements routes in its assigned file under `src/routes/`.
2. **Central Router Registry**: Only `src/routes/index.ts` mounts routers.
3. **No Direct Controller Inter-dependencies**: Cross-module communication must happen through services.
4. **Compile-time Types**: All DB interfaces use generated types from `supabase/types.ts`.

## 2. Secrets & Configurations Protocol

* Uses `src/config/env.ts` (Zod schema for env vars).
* Maintains `.env.example` at the repository root.
* Credentials are **never** committed to Git.
* Important environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FIREBASE_SERVICE_ACCOUNT_BASE64`.

## 3. Standardized Integration Rules

### Standard Response & Error Format
* **Success**: `{ "success": true, "data": { ... } }`
* **Error**: `{ "error": "Human-readable message", "code": "ERR_SPECIFIC_CODE" }`
* Global error handler processes `appError(statusCode, message, code)`.

## 4. API Endpoint Summary (Reference)

### Profiles
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/profiles` | ✅ | Create profile after sign-up |
| `GET` | `/api/profiles/me` | ✅ | Get own profile (joined with worker data) |
| `PUT` | `/api/profiles/me` | ✅ | Update profile fields |
| `PUT` | `/api/profiles/me/fcm-token` | ✅ | Store FCM push token |

### Categories
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/categories` | ❌ | List active categories |

### Jobs
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/jobs/create` | ✅ | Create a new job |
| `POST` | `/api/jobs/:id/cancel` | ✅ | Cancel a job |
| `POST` | `/api/jobs/:id/complete` | ✅ | Mark job as completed |
| `GET` | `/api/jobs/mine` | ✅ | List client's own jobs |
| `GET` | `/api/jobs/:id` | ✅ | Get single job details |

### Workers
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `PUT` | `/api/workers/location` | ✅ | Update GPS coordinates |
| `PUT` | `/api/workers/availability` | ✅ | Toggle is_available |
| `GET` | `/api/workers/nearby` | ✅ | Find nearby workers |
| `POST` | `/api/workers/accept/:jobId` | ✅ | Accept a job (atomic) |
| `POST` | `/api/workers/decline/:jobId` | ✅ | Decline a job |
| `PUT` | `/api/workers/me/profile` | ✅ | Update worker skills/rate/areas |
| `GET` | `/api/workers/me/active-job` | ✅ | Get current active job |
| `POST` | `/api/workers/:jobId/start` | ✅ | Start a matched job |
| `GET` | `/api/workers/me/history` | ✅ | Get past jobs |

### Reviews
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/reviews` | ✅ | Submit a review |
| `GET` | `/api/reviews/worker/:workerId` | ❌ | Get worker's reviews |

### Chat
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/conversations` | ✅ | List conversations |
| `GET` | `/api/conversations/:id/messages` | ✅ | Get messages |
| `POST` | `/api/conversations/:id/messages` | ✅ | Send a message |

## 5. PostgreSQL Database Connection Details
* **Host**: `db.qdeznjpvkhrxesjykovi.supabase.co`
* **Port**: `5432`
* **Database**: `postgres`
* **User**: `postgres`