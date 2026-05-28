# Artisans — Express Backend Delegation & Coordination Plan (v2)

> **Revised 2026-05-28** after full frontend gap analysis.
> Previous plan superseded. This is the single source of truth for backend work.

This plan establishes how our team (**Kwabena, Peniel, and Nhyira**) will collaborate on the Express.js backend. It is based on a deep analysis of the actual Flutter frontend screens, models, and data flows.

---

## 1. What Already Exists (Kwabena's Foundation)

The following code is **already built, compiled, and merged to `main`**. Do NOT rewrite these files — only extend them as instructed.

| Layer | Files | Owner |
|-------|-------|-------|
| Config | `src/config/env.ts`, `firebase.ts`, `supabase.ts` | Kwabena |
| Middleware | `src/middleware/auth.ts`, `globalerrorHandler.ts` | Kwabena |
| Route Registry | `src/routes/index.ts` (mounts jobs, workers, conversations) | Kwabena |
| Jobs | `src/routes/jobs.ts`, `src/services/jobsService.ts` (create, cancel, complete) | Kwabena |
| Workers | `src/routes/workers.ts`, `src/services/workersService.ts` (location, availability, nearby, accept, decline) | Kwabena |
| Chat | `src/routes/chat.ts`, `src/services/chatService.ts` (list, messages, send) | Kwabena |
| Matching Engine | `src/services/matchingService.ts` (multi-round dispatch) | Kwabena |
| Notifications | `src/services/notifyService.ts` (6 notification types) | Kwabena |
| Validators | `src/validators/jobs.validator.ts`, `workers.validator.ts`, `chat.validator.ts` | Kwabena |
| Utils | `src/utils/haversine.ts`, `appError.ts`, `routeParams.ts`, `catchAsync.ts` | Kwabena |
| Database | `supabase/migrations/20260528000000_init_schema.sql`, `supabase/types.ts` | Kwabena |

---

## 2. Modular Architecture & Directory Design

After all work is complete, the directory will look like this. Items marked 🆕 or 🔧 are what needs to be built/extended.

```
artisansApp_backend/
├── src/
│   ├── config/              # ✅ No changes needed
│   ├── middleware/           # ✅ No changes needed
│   ├── constants/
│   │   └── enums.ts         # ✅ No changes needed
│   ├── routes/
│   │   ├── index.ts         # 🔧 Mount profiles, categories, reviews (Kwabena)
│   │   ├── profiles.ts      # 🆕 Kwabena
│   │   ├── categories.ts    # 🆕 Kwabena
│   │   ├── jobs.ts          # 🔧 Add GET endpoints (Nhyira)
│   │   ├── workers.ts       # 🔧 Add profile/history/start endpoints (Peniel)
│   │   ├── reviews.ts       # 🆕 Nhyira
│   │   └── chat.ts          # ✅ No changes needed
│   ├── services/
│   │   ├── profilesService.ts   # 🆕 Kwabena
│   │   ├── categoriesService.ts # 🆕 Kwabena
│   │   ├── jobsService.ts       # 🔧 Add getMyJobs, getJobById (Nhyira)
│   │   ├── workersService.ts    # 🔧 Add profile update, active job, start, history (Peniel)
│   │   ├── reviewsService.ts    # 🆕 Nhyira
│   │   ├── matchingService.ts   # ✅ No changes
│   │   ├── notifyService.ts     # ✅ No changes
│   │   ├── chatService.ts       # ✅ No changes
│   │   └── schedulerService.ts  # ✅ No changes
│   ├── validators/
│   │   ├── profiles.validator.ts # 🆕 Kwabena
│   │   ├── reviews.validator.ts  # 🆕 Nhyira
│   │   ├── workers.validator.ts  # 🔧 Add updateWorkerProfileSchema (Peniel)
│   │   ├── jobs.validator.ts     # ✅ No changes
│   │   └── chat.validator.ts     # ✅ No changes
│   └── utils/               # ✅ No changes needed
└── supabase/
    ├── migrations/           # ✅ Schema exists
    ├── seeds/                # 🆕 categories seed (Kwabena)
    └── types.ts              # ✅ Generated
```

### Loose Coupling Rules (Unchanged)
1. **Isolated Routing Files**: Each module owner implements routes in their assigned file under `src/routes/`.
2. **Central Router Registry**: Only `src/routes/index.ts` mounts routers. Feature developers touch this file once.
3. **No Direct Controller Inter-dependencies**: Cross-module communication must happen through services.
4. **Compile-time Types**: All DB interfaces must use generated types from `supabase/types.ts`.

---

## 3. Secrets & Configurations Protocol (Unchanged)

**Kwabena** remains the Secrets & Configuration Officer.

* Maintains `src/config/env.ts` (Zod schema for env vars).
* Maintains `.env.example` at the repository root.
* Credentials are **never** committed to Git.
* Environment variables already configured: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FIREBASE_SERVICE_ACCOUNT_BASE64`.

---

## 4. Developer Blueprints: How to Build Your Module

### 👤 Kwabena — Profiles + Categories (Phase 0 — BLOCKING)

Everything else is blocked until these endpoints exist. Without profiles, the frontend cannot persist user data after auth sign-up.

#### 4.1 Profiles Validator (`src/validators/profiles.validator.ts`)
```typescript
import { z } from "zod";

export const createProfileSchema = z.object({
  full_name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(1),
  role: z.enum(["client", "worker"]),
  avatar_url: z.string().url().optional(),
  // Worker-specific fields (only validated if role === "worker")
  skills: z.array(z.string().trim().min(1)).default([]),
  hourly_rate: z.number().positive().optional(),
  rate_type: z.enum(["hourly", "fixed"]).default("hourly"),
  service_areas: z.array(z.string().trim().min(1)).default([]),
  bio: z.string().trim().max(500).optional(),
  experience_band: z.string().trim().optional(),
});

export const updateProfileSchema = z.object({
  full_name: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().min(1).optional(),
  avatar_url: z.string().url().nullable().optional(),
  bio: z.string().trim().max(500).optional(),
});

export const fcmTokenSchema = z.object({
  fcm_token: z.string().trim().min(1),
});
```

#### 4.2 Profiles Service (`src/services/profilesService.ts`)
```typescript
import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";
import {
  createProfileSchema,
  updateProfileSchema,
  fcmTokenSchema,
} from "../validators/profiles.validator";

export async function createProfile(userId: string, body: unknown) {
  const parsed = createProfileSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid profile", "VALIDATION_ERROR");
  }

  const input = parsed.data;

  // 1. Insert into profiles table
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .insert({
      id: userId,
      full_name: input.full_name,
      phone: input.phone,
      role: input.role,
      avatar_url: input.avatar_url ?? null,
    });

  if (profileError) throw appError(500, profileError.message, "PROFILE_CREATE_FAILED");

  // 2. If worker, also insert into workers table
  if (input.role === "worker") {
    const { error: workerError } = await supabaseAdmin
      .from("workers")
      .insert({
        id: userId,
        skills: input.skills,
        hourly_rate: input.hourly_rate ?? null,
        rate_type: input.rate_type,
        service_areas: input.service_areas,
      });

    if (workerError) throw appError(500, workerError.message, "WORKER_PROFILE_CREATE_FAILED");
  }

  return getProfile(userId);
}

export async function getProfile(userId: string) {
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw appError(500, error.message, "PROFILE_FETCH_FAILED");
  if (!profile) throw appError(404, "Profile not found", "PROFILE_NOT_FOUND");

  // If worker, join worker data
  if (profile.role === "worker") {
    const { data: worker } = await supabaseAdmin
      .from("workers")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    return { ...profile, worker: worker ?? null };
  }

  return { ...profile, worker: null };
}

export async function updateProfile(userId: string, body: unknown) {
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid update", "VALIDATION_ERROR");
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select()
    .single();

  if (error) throw appError(500, error.message, "PROFILE_UPDATE_FAILED");
  return data;
}

export async function updateFcmToken(userId: string, body: unknown) {
  const parsed = fcmTokenSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, "Invalid FCM token", "VALIDATION_ERROR");
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ fcm_token: parsed.data.fcm_token })
    .eq("id", userId);

  if (error) throw appError(500, error.message, "FCM_TOKEN_UPDATE_FAILED");
  return { success: true };
}
```

#### 4.3 Profiles Route (`src/routes/profiles.ts`)
```typescript
import { Router, type Request, type Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { catchAsync } from "../utils/catchAsync";
import * as profilesService from "../services/profilesService";

const router = Router();

router.post(
  "/",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const profile = await profilesService.createProfile(req.user!.id, req.body);
    res.status(201).json({ success: true, data: profile });
  }),
);

router.get(
  "/me",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const profile = await profilesService.getProfile(req.user!.id);
    res.status(200).json({ success: true, data: profile });
  }),
);

router.put(
  "/me",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const profile = await profilesService.updateProfile(req.user!.id, req.body);
    res.status(200).json({ success: true, data: profile });
  }),
);

router.put(
  "/me/fcm-token",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const result = await profilesService.updateFcmToken(req.user!.id, req.body);
    res.status(200).json(result);
  }),
);

export default router;
```

#### 4.4 Categories Service (`src/services/categoriesService.ts`)
```typescript
import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";

export async function listCategories() {
  const { data, error } = await supabaseAdmin
    .from("categories")
    .select("id, name, slug, icon_name, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw appError(500, error.message, "CATEGORIES_FETCH_FAILED");
  return data ?? [];
}
```

#### 4.5 Categories Route (`src/routes/categories.ts`)
```typescript
import { Router, type Request, type Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import * as categoriesService from "../services/categoriesService";

const router = Router();

// Public endpoint — no auth required
router.get(
  "/",
  catchAsync(async (_req: Request, res: Response) => {
    const categories = await categoriesService.listCategories();
    res.status(200).json({ success: true, data: categories });
  }),
);

export default router;
```

#### 4.6 Mount New Routers (`src/routes/index.ts` — UPDATE)
```typescript
import { Router } from "express";
import profilesRouter from "./profiles";
import categoriesRouter from "./categories";
import jobsRouter from "./jobs";
import workersRouter from "./workers";
import reviewsRouter from "./reviews";
import chatRouter from "./chat";

const router = Router();

// Mount modules
router.use("/profiles", profilesRouter);
router.use("/categories", categoriesRouter);
router.use("/jobs", jobsRouter);
router.use("/workers", workersRouter);
router.use("/reviews", reviewsRouter);
router.use("/conversations", chatRouter);

export default router;
```

#### 4.7 Categories Seed Data (`supabase/seeds/categories.sql`)
```sql
INSERT INTO categories (name, slug, icon_name, sort_order) VALUES
  ('Plumbing',      'plumbing',      'plumbing',      1),
  ('Electrical',    'electrical',    'electrical_services', 2),
  ('Carpentry',     'carpentry',     'carpenter',     3),
  ('Cleaning',      'cleaning',      'cleaning_services', 4),
  ('Painting',      'painting',      'format_paint',  5),
  ('Construction',  'construction',  'construction',  6),
  ('HVAC',          'hvac',          'hvac',          7),
  ('Landscaping',   'landscaping',   'grass',         8)
ON CONFLICT (slug) DO NOTHING;
```

---

### 👤 Peniel — Workers Module Extensions (Phase 1)

Peniel extends the existing `workers.ts` and `workersService.ts` files. These endpoints complete the worker's in-app job lifecycle.

#### 5.1 New Validator (Add to `src/validators/workers.validator.ts`)
```typescript
// Add this to the existing file — do not overwrite existing schemas

export const updateWorkerProfileSchema = z.object({
  skills: z.array(z.string().trim().min(1)).optional(),
  hourly_rate: z.number().positive().optional(),
  rate_type: z.enum(["hourly", "fixed"]).optional(),
  service_areas: z.array(z.string().trim().min(1)).optional(),
});
```

#### 5.2 New Service Functions (Add to `src/services/workersService.ts`)
```typescript
// Add these functions to the existing file

export async function updateWorkerProfile(userId: string, body: unknown) {
  const parsed = updateWorkerProfileSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid worker profile", "VALIDATION_ERROR");
  }

  const patch: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() };

  const { data, error } = await supabaseAdmin
    .from("workers")
    .update(patch)
    .eq("id", userId)
    .select()
    .single();

  if (error) throw appError(500, error.message, "WORKER_PROFILE_UPDATE_FAILED");
  return data;
}

export async function getActiveJob(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("jobs")
    .select("*, profiles!jobs_client_id_fkey(full_name, avatar_url, phone)")
    .eq("worker_id", userId)
    .in("status", [JOB_STATUS.MATCHED, JOB_STATUS.IN_PROGRESS])
    .order("updated_at", { ascending: false })
    .maybeSingle();

  if (error) throw appError(500, error.message, "ACTIVE_JOB_FETCH_FAILED");
  return data; // null if no active job
}

export async function startJob(userId: string, jobId: string) {
  // Atomic: only transition matched → in_progress if worker owns it
  const { data, error } = await supabaseAdmin
    .from("jobs")
    .update({ status: JOB_STATUS.IN_PROGRESS, updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("worker_id", userId)
    .eq("status", JOB_STATUS.MATCHED)
    .select()
    .maybeSingle();

  if (error) throw appError(500, error.message, "JOB_START_FAILED");
  if (!data) throw appError(409, "Job cannot be started — wrong status or not assigned to you", "INVALID_JOB_STATE");

  await notifyService.notifyJobStarted(data.client_id);

  return data;
}

export async function getHistory(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("jobs")
    .select("id, title, status, budget_fixed, budget_min, budget_max, updated_at, profiles!jobs_client_id_fkey(full_name, avatar_url)")
    .eq("worker_id", userId)
    .in("status", [JOB_STATUS.COMPLETED, JOB_STATUS.CANCELLED])
    .order("updated_at", { ascending: false });

  if (error) throw appError(500, error.message, "HISTORY_FETCH_FAILED");
  return data ?? [];
}
```

> **Note**: `notifyService.notifyJobStarted` needs to be added to `notifyService.ts`:
```typescript
export async function notifyJobStarted(clientId: string): Promise<void> {
  await sendToUser(clientId, {
    title: "Artisan on the way",
    body: "Your artisan has started the job",
    data: { type: "job_started" },
  });
}
```

#### 5.3 New Routes (Add to `src/routes/workers.ts`)
```typescript
// Add these routes to the existing router — do not overwrite existing routes

router.put(
  "/me/profile",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const worker = await workersService.updateWorkerProfile(req.user!.id, req.body);
    res.status(200).json({ success: true, data: worker });
  }),
);

router.get(
  "/me/active-job",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const job = await workersService.getActiveJob(req.user!.id);
    res.status(200).json({ success: true, data: job });
  }),
);

router.post(
  "/:jobId/start",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const job = await workersService.startJob(req.user!.id, paramId(req.params.jobId));
    res.status(200).json({ success: true, data: job });
  }),
);

router.get(
  "/me/history",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const jobs = await workersService.getHistory(req.user!.id);
    res.status(200).json({ success: true, data: jobs });
  }),
);
```

---

### 👤 Nhyira — Jobs Extensions + Reviews (Phase 1–2)

Nhyira extends the existing `jobs.ts` and `jobsService.ts`, and creates the new Reviews module.

#### 6.1 New Service Functions (Add to `src/services/jobsService.ts`)
```typescript
// Add these functions to the existing file

export async function getMyJobs(userId: string, statusFilter?: string[]) {
  let query = supabaseAdmin
    .from("jobs")
    .select("id, title, status, job_mode, budget_type, budget_fixed, budget_min, budget_max, address_label, created_at, updated_at, profiles!jobs_worker_id_fkey(full_name, avatar_url)")
    .eq("client_id", userId)
    .order("created_at", { ascending: false });

  if (statusFilter && statusFilter.length > 0) {
    query = query.in("status", statusFilter);
  }

  const { data, error } = await query;
  if (error) throw appError(500, error.message, "JOBS_FETCH_FAILED");
  return data ?? [];
}

export async function getJobById(userId: string, jobId: string) {
  const { data: job, error } = await supabaseAdmin
    .from("jobs")
    .select("*, profiles!jobs_client_id_fkey(full_name, avatar_url, phone), profiles!jobs_worker_id_fkey(full_name, avatar_url, phone)")
    .eq("id", jobId)
    .maybeSingle();

  if (error) throw appError(500, error.message, "JOB_FETCH_FAILED");
  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");

  // Only participants can view a job
  if (job.client_id !== userId && job.worker_id !== userId) {
    throw appError(403, "Not authorized to view this job", "FORBIDDEN");
  }

  return job;
}
```

#### 6.2 New Routes (Add to `src/routes/jobs.ts`)
```typescript
// Add these routes to the existing router — do not overwrite existing routes

router.get(
  "/mine",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const statusParam = req.query.status as string | undefined;
    const statusFilter = statusParam ? statusParam.split(",") : undefined;
    const jobs = await jobsService.getMyJobs(req.user!.id, statusFilter);
    res.status(200).json({ success: true, data: jobs });
  }),
);

router.get(
  "/:id",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const job = await jobsService.getJobById(req.user!.id, paramId(req.params.id));
    res.status(200).json({ success: true, data: job });
  }),
);
```

> **IMPORTANT**: Place `GET /mine` **before** `GET /:id` in the router so that Express doesn't interpret "mine" as a UUID param.

#### 6.3 Reviews Validator (`src/validators/reviews.validator.ts`)
```typescript
import { z } from "zod";

export const createReviewSchema = z.object({
  job_id: z.string().uuid(),
  worker_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});
```

#### 6.4 Reviews Service (`src/services/reviewsService.ts`)
```typescript
import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";
import { createReviewSchema } from "../validators/reviews.validator";

export async function createReview(userId: string, body: unknown) {
  const parsed = createReviewSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid review", "VALIDATION_ERROR");
  }

  const input = parsed.data;

  // Verify: job exists, is completed, and user is the client
  const { data: job } = await supabaseAdmin
    .from("jobs")
    .select("id, client_id, worker_id, status")
    .eq("id", input.job_id)
    .maybeSingle();

  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");
  if (job.status !== "completed") throw appError(400, "Can only review completed jobs", "JOB_NOT_COMPLETED");
  if (job.client_id !== userId) throw appError(403, "Only the client can review", "FORBIDDEN");
  if (job.worker_id !== input.worker_id) throw appError(400, "Worker ID does not match the job", "WORKER_MISMATCH");

  const { data, error } = await supabaseAdmin
    .from("reviews")
    .insert({
      job_id: input.job_id,
      reviewer_id: userId,
      worker_id: input.worker_id,
      rating: input.rating,
      comment: input.comment ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      throw appError(409, "You have already reviewed this job", "REVIEW_EXISTS");
    }
    throw appError(500, error.message, "REVIEW_CREATE_FAILED");
  }

  return data;
}

export async function getWorkerReviews(workerId: string) {
  const { data, error } = await supabaseAdmin
    .from("reviews")
    .select("id, rating, comment, created_at, profiles!reviews_reviewer_id_fkey(full_name, avatar_url)")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false });

  if (error) throw appError(500, error.message, "REVIEWS_FETCH_FAILED");
  return data ?? [];
}
```

#### 6.5 Reviews Route (`src/routes/reviews.ts`)
```typescript
import { Router, type Request, type Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { catchAsync } from "../utils/catchAsync";
import * as reviewsService from "../services/reviewsService";
import { paramId } from "../utils/routeParams";

const router = Router();

router.post(
  "/",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const review = await reviewsService.createReview(req.user!.id, req.body);
    res.status(201).json({ success: true, data: review });
  }),
);

router.get(
  "/worker/:workerId",
  catchAsync(async (req: Request, res: Response) => {
    const reviews = await reviewsService.getWorkerReviews(paramId(req.params.workerId));
    res.status(200).json({ success: true, data: reviews });
  }),
);

export default router;
```

---

## 7. API Endpoint Summary (Full Reference)

### Profiles — Kwabena (Phase 0)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/profiles` | ✅ | Create profile after sign-up |
| `GET` | `/api/profiles/me` | ✅ | Get own profile (joined with worker data) |
| `PUT` | `/api/profiles/me` | ✅ | Update profile fields |
| `PUT` | `/api/profiles/me/fcm-token` | ✅ | Store FCM push token |

### Categories — Kwabena (Phase 0)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/categories` | ❌ | List active categories |

### Jobs — Kwabena (existing) + Nhyira (extensions)
| Method | Path | Auth | Purpose | Owner |
|--------|------|------|---------|-------|
| `POST` | `/api/jobs/create` | ✅ | Create a new job | ✅ Exists |
| `POST` | `/api/jobs/:id/cancel` | ✅ | Cancel a job | ✅ Exists |
| `POST` | `/api/jobs/:id/complete` | ✅ | Mark job as completed | ✅ Exists |
| `GET` | `/api/jobs/mine` | ✅ | List client's own jobs | 🆕 Nhyira |
| `GET` | `/api/jobs/:id` | ✅ | Get single job details | 🆕 Nhyira |

### Workers — Kwabena (existing) + Peniel (extensions)
| Method | Path | Auth | Purpose | Owner |
|--------|------|------|---------|-------|
| `PUT` | `/api/workers/location` | ✅ | Update GPS coordinates | ✅ Exists |
| `PUT` | `/api/workers/availability` | ✅ | Toggle is_available | ✅ Exists |
| `GET` | `/api/workers/nearby` | ✅ | Find nearby workers | ✅ Exists |
| `POST` | `/api/workers/accept/:jobId` | ✅ | Accept a job (atomic) | ✅ Exists |
| `POST` | `/api/workers/decline/:jobId` | ✅ | Decline a job | ✅ Exists |
| `PUT` | `/api/workers/me/profile` | ✅ | Update worker skills/rate/areas | 🆕 Peniel |
| `GET` | `/api/workers/me/active-job` | ✅ | Get current active job | 🆕 Peniel |
| `POST` | `/api/workers/:jobId/start` | ✅ | Start a matched job | 🆕 Peniel |
| `GET` | `/api/workers/me/history` | ✅ | Get past jobs | 🆕 Peniel |

### Reviews — Nhyira (Phase 2)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/reviews` | ✅ | Submit a review |
| `GET` | `/api/reviews/worker/:workerId` | ❌ | Get worker's reviews |

### Chat — ✅ Complete (No Changes)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/conversations` | ✅ | List conversations |
| `GET` | `/api/conversations/:id/messages` | ✅ | Get messages |
| `POST` | `/api/conversations/:id/messages` | ✅ | Send a message |

---

## 8. Standardized Integration Rules (Unchanged)

### 8.1 Standard Response & Error Format
* **Success**: `{ "success": true, "data": { ... } }`
* **Error**: `{ "error": "Human-readable message", "code": "ERR_SPECIFIC_CODE" }`
* Throw `appError(statusCode, message, code)` — the global error handler processes it.

### 8.2 Git Collaboration Rules
1. **Branch Names**:
   * Kwabena: `feat/backend/profiles-categories`
   * Peniel: `feat/backend/workers-extensions`
   * Nhyira: `feat/backend/jobs-reviews`
2. **Before pushing**: `git status` — confirm no `.env` files staged.
3. **Before merging**: `npm run build` — verify clean compilation.

---

## 9. Execution Phases

```
Phase 0 — BLOCKING (Kwabena only):
  ├── Profiles module (create, read, update, fcm-token)
  ├── Categories module (list)
  ├── Mount new routers in index.ts
  ├── Seed categories table
  └── npm run build → verify

Phase 1 — Core Flows (Peniel + Nhyira, in parallel):
  ├── Peniel: PUT /workers/me/profile
  ├── Peniel: GET /workers/me/active-job
  ├── Peniel: POST /workers/:jobId/start
  ├── Peniel: GET /workers/me/history
  ├── Nhyira: GET /jobs/mine
  ├── Nhyira: GET /jobs/:id
  └── npm run build → verify

Phase 2 — Completion Features (Nhyira):
  ├── Reviews module (create + list by worker)
  └── npm run build → verify
```

---

## 10. PostgreSQL Database Connection Details

* **Host**: `db.qdeznjpvkhrxesjykovi.supabase.co`
* **Port**: `5432`
* **Database**: `postgres`
* **User**: `postgres`
* **Connection URI**:
  ```
  postgresql://postgres:[YOUR-DATABASE-PASSWORD]@db.qdeznjpvkhrxesjykovi.supabase.co:5432/postgres
  ```
