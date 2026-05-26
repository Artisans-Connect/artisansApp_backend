# Artisans — Express Backend Delegation & Coordination Plan

This delegation plan establishes how our team (**Kwabena, Peniel, and Nhyira**) will collaborate on the Express.js backend. Drawing inspiration from the frontend modularity model in `artisansApp_frontend` (which split the app into `auth`, `client`, `worker`, and `shared` modules), this plan divides the backend milestones into distinct, loosely-coupled modules to maximize parallel development and eliminate merge conflicts.

---

## 1. Modular Architecture & Directory Design

To ensure team members can work independently without blocking each other or causing git conflicts, the Express application is structured around a **Domain-Driven Directory Layout**. 

```
artisansApp_backend/
├── src/
│   ├── config/              # Central configuration and environment schemas
│   │   ├── env.ts           # Zod schema validation for environment variables (Kwabena)
│   │   ├── firebase.ts      # Firebase App initialisation (Kwabena)
│   │   └── supabase.ts      # Supabase client initialisation (Kwabena)
│   ├── middleware/          # Shared security and authentication middleware
│   │   ├── auth.ts          # Verify JWT and extract user context (Kwabena)
│   │   ├── rateLimiter.ts   # Rate limiting rules (Kwabena)
│   │   └── globalerrorHandler.ts # Standard error response maps (Kwabena)
│   ├── routes/              # Central routing registry and sub-routers
│   │   ├── index.ts         # Central router mounting all feature sub-routers (Kwabena)
│   │   ├── jobs.ts          # Client/Jobs feature router (Nhyira)
│   │   ├── workers.ts       # Worker/Availability feature router (Peniel)
│   │   └── chat.ts          # Messaging/Chat feature router (Nhyira)
│   ├── controllers/         # HTTP request/response handling (Separated by owner)
│   │   ├── jobsController.ts   # Jobs REST endpoints logic (Nhyira)
│   │   ├── workersController.ts # Workers REST endpoints logic (Peniel)
│   │   └── chatController.ts   # Chat REST endpoints logic (Nhyira)
│   ├── services/            # Pure business logic and Supabase CRUD
│   │   ├── jobsService.ts      # Jobs database CRUD and workflows (Nhyira)
│   │   ├── workersService.ts   # Worker coordinates and status database calls (Peniel)
│   │   ├── matchingService.ts  # Proximity search and matching engine logic (Peniel)
│   │   ├── notifyService.ts    # FCM messaging wrappers (Nhyira)
│   │   └── chatService.ts      # Chat database CRUD and history fetches (Nhyira)
│   └── utils/               # Shared helper functions
│       └── haversine.ts     # Geospatial distance calculator (Peniel)
```

### Loose Coupling Rules:
1. **Isolated Routing Files**: Do not add routes for different modules to a single, monolithic file. Each module owner must implement their routes in their assigned routing file under `src/routes/` (e.g., `jobs.ts` or `workers.ts`).
2. **Central Router Registry**: The only shared routing file is `src/routes/index.ts`. It acts as the gateway and mounts each router. Feature developers will only touch this file once to register their router.
3. **No Direct Controller Inter-dependencies**: Controllers in one module must not import controllers from another module. If cross-communication is needed, it must happen through services (e.g., the worker accept endpoint calling `matchingService` to trigger re-dispatch).
4. **Compile-time Types**: All database interfaces must use generated types from `supabase/types.ts` via the Supabase client.

---

## 2. Secrets & Configurations Protocol

To ensure credential security, prevent key leaks, and enforce standard local environments, **Kwabena** is designated as the **Secrets & Configuration Officer**.

### Secrets Officer Responsibilities:
* **Schema Enforcement**: Maintain and update `src/config/env.ts` using Zod to enforce that the server fails fast on startup if any required environment variable is missing or malformed.
* **Credential Sharing**: Own the secure distribution of credentials (e.g., Supabase service role keys, FCM service account file JSON). These must **NEVER** be committed to Git or sent over insecure channels (like public Discord/Slack). They should be shared via encrypted secure notes or a shared team password manager vault.
* **Environment Template**: Maintain the public template `.env.example` at the repository root. Whenever a teammate introduces a new dependency requiring environment configuration, they must coordinate with Kwabena to update the Zod schema and `.env.example`.
* **Repository Safety**: Periodically audit the codebase and git history to ensure no developer has committed `.env` files or hardcoded API keys.

---

## 3. Developer Blueprints: How to Build Your Module

To make implementation seamless, follow the code structures below for controllers, services, and route definitions.

### 👤 Nhyira — Jobs Module Blueprint

Nhyira is responsible for the client-facing **Jobs Module (Milestone 2)**. 

#### 1. Jobs Service (`src/services/jobsService.ts`)
```typescript
import { supabase } from "../config/supabase";
import createHttpError from "http-errors";

export interface CreateJobInput {
  client_id: string;
  category_id: string;
  title: string;
  description: string;
  photo_urls: string[];
  location_lat: number;
  location_lng: number;
  address_label: string;
  job_mode: "asap" | "scheduled" | "flexible";
  budget_type: "fixed" | "range" | "negotiable";
  budget_fixed?: number;
  budget_min?: number;
  budget_max?: number;
  scheduled_for?: string;
  service_type: "home_visit" | "remote" | "either";
}

export class JobsService {
  static async createJob(jobData: CreateJobInput) {
    const { data, error } = await supabase
      .from("jobs")
      .insert({
        ...jobData,
        status: "searching", // Default starting status for ASAP
      })
      .select()
      .single();

    if (error) {
      throw createHttpError(500, `Database error: ${error.message}`);
    }
    return data;
  }

  static async cancelJob(jobId: string, clientId: string) {
    // Confirm ownership
    const { data: job, error: fetchError } = await supabase
      .from("jobs")
      .select("client_id, status")
      .eq("id", jobId)
      .single();

    if (fetchError || !job) {
      throw createHttpError(404, "Job not found");
    }

    if (job.client_id !== clientId) {
      throw createHttpError(403, "You are not authorized to cancel this job");
    }

    const { data, error } = await supabase
      .from("jobs")
      .update({ status: "cancelled" })
      .eq("id", jobId)
      .select()
      .single();

    if (error) {
      throw createHttpError(500, `Database error: ${error.message}`);
    }
    return data;
  }
}
```

#### 2. Jobs Controller (`src/controllers/jobsController.ts`)
```typescript
import type { Request, Response, NextFunction } from "express";
import { JobsService } from "../services/jobsService";
import { z } from "zod";

const createJobSchema = z.object({
  category_id: z.string().uuid(),
  title: z.string().min(5).max(80),
  description: z.string().min(10),
  photo_urls: z.array(z.string().url()).default([]),
  location_lat: z.number().min(-90).max(90),
  location_lng: z.number().min(-180).max(180),
  address_label: z.string(),
  job_mode: z.enum(["asap", "scheduled", "flexible"]),
  budget_type: z.enum(["fixed", "range", "negotiable"]),
  budget_fixed: z.number().optional(),
  budget_min: z.number().optional(),
  budget_max: z.number().optional(),
  scheduled_for: z.string().datetime().optional(),
  service_type: z.enum(["home_visit", "remote", "either"]),
});

export class JobsController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      // Validate inputs
      const validatedData = createJobSchema.parse(req.body);
      
      // req.user is populated by Kwabena's authMiddleware
      const client_id = req.user.id; 

      const newJob = await JobsService.createJob({
        ...validatedData,
        client_id,
      });

      res.status(201).json({
        success: true,
        data: newJob,
      });
    } catch (error) {
      next(error); // Passes to Kwabena's globalErrorHandler
    }
  }

  static async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const jobId = req.params.id;
      const clientId = req.user.id;

      const cancelledJob = await JobsService.cancelJob(jobId, clientId);

      res.status(200).json({
        success: true,
        data: cancelledJob,
      });
    } catch (error) {
      next(error);
    }
  }
}
```

---

### 👤 Peniel — Workers Module & Matching Engine Blueprint

Peniel is responsible for the **Workers Module (Milestone 3)** and the **Matching Engine (Milestone 4)**.

#### 1. Worker Location & Availability Service (`src/services/workersService.ts`)
```typescript
import { supabase } from "../config/supabase";
import createHttpError from "http-errors";

export class WorkersService {
  static async updateLocation(workerId: string, lat: number, lng: number) {
    const { error } = await supabase
      .from("workers")
      .update({
        current_lat: lat,
        current_lng: lng,
        location_at: new Date().toISOString(),
      })
      .eq("id", workerId);

    if (error) {
      throw createHttpError(500, `Failed to update coordinates: ${error.message}`);
    }
  }

  static async toggleAvailability(workerId: string, isAvailable: boolean) {
    const updatePayload: Record<string, any> = { is_available: isAvailable };
    
    // If going offline, wipe location timestamp to exclude from nearby searches
    if (!isAvailable) {
      updatePayload.location_at = null;
    }

    const { data, error } = await supabase
      .from("workers")
      .update(updatePayload)
      .eq("id", workerId)
      .select()
      .single();

    if (error) {
      throw createHttpError(500, `Failed to update availability: ${error.message}`);
    }
    return data;
  }
}
```

#### 2. Atomic Accept Service Logic (`src/services/workersService.ts`)
*Crucial*: To prevent double-acceptance by two workers simultaneously, Peniel must implement an **atomic conditional update** (checking status and updating in a single SQL operation).

```typescript
  static async acceptJob(jobId: string, workerId: string) {
    // Atomic update using Supabase's filter queries
    const { data, error } = await supabase
      .from("jobs")
      .update({
        status: "matched",
        worker_id: workerId,
        updated_at: new Date().toISOString()
      })
      .eq("id", jobId)
      .in("status", ["searching", "matching"]) // Can only accept if currently searching/matching
      .select();

    if (error) {
      throw createHttpError(500, `Database error: ${error.message}`);
    }

    // If no row was updated, it means another worker accepted it first or it expired
    if (!data || data.length === 0) {
      throw createHttpError(409, "Conflict: Job has already been accepted by another artisan or has expired.");
    }

    return data[0];
  }
```

#### 3. Haversine Helper (`src/utils/haversine.ts`)
```typescript
/**
 * Calculates the great-circle distance between two points on the Earth's surface
 * using the Haversine formula. Returns distance in kilometers.
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
      
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
```

#### 4. Workers Controller (`src/controllers/workersController.ts`)
```typescript
import type { Request, Response, NextFunction } from "express";
import { WorkersService } from "../services/workersService";
import { z } from "zod";

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export class WorkersController {
  static async updateLocation(req: Request, res: Response, next: NextFunction) {
    try {
      const { lat, lng } = locationSchema.parse(req.body);
      const workerId = req.user.id;

      await WorkersService.updateLocation(workerId, lat, lng);

      res.status(200).json({ success: true, message: "Location updated successfully." });
    } catch (error) {
      next(error);
    }
  }

  static async accept(req: Request, res: Response, next: NextFunction) {
    try {
      const jobId = req.params.jobId;
      const workerId = req.user.id;

      const acceptedJob = await WorkersService.acceptJob(jobId, workerId);

      res.status(200).json({
        success: true,
        data: acceptedJob,
      });
    } catch (error) {
      next(error);
    }
  }
}
```

---

### 👤 Nhyira — Notifications & Chat Blueprints

Nhyira is responsible for the **FCM Notification Service (Milestone 5)** and the **Chat Module (Milestone 6.5)**.

#### 1. Notification Service (`src/services/notifyService.ts`)
```typescript
import admin from "../config/firebase";
import { supabase } from "../config/supabase";

export class NotifyService {
  /**
   * Sends a push notification to a profile's saved FCM token.
   * Logs any failures rather than crashing the HTTP request.
   */
  static async sendToUser(userId: string, title: string, body: string, dataPayload: Record<string, string> = {}) {
    try {
      // 1. Fetch user FCM token from Supabase profiles
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("fcm_token")
        .eq("id", userId)
        .single();

      if (error || !profile?.fcm_token) {
        console.warn(`Could not send notification: User ${userId} has no registered FCM token.`);
        return;
      }

      // 2. Dispatch payload via firebase-admin
      const message = {
        notification: {
          title,
          body,
        },
        data: dataPayload,
        token: profile.fcm_token,
      };

      const response = await admin.messaging().send(message);
      console.log(`Notification sent successfully to ${userId}: ${response}`);
    } catch (err: any) {
      // Log errors safely to server diagnostics
      console.error(`Firebase messaging failure for user ${userId}:`, err.message);
    }
  }
}
```

#### 2. Chat Service (`src/services/chatService.ts`)
```typescript
import { supabase } from "../config/supabase";
import createHttpError from "http-errors";

export class ChatService {
  /**
   * Fetches conversations for the logged in user based on profile role.
   */
  static async getConversations(userId: string) {
    // Querying active message threads involving the user
    const { data, error } = await supabase
      .from("messages")
      .select("job_id, sender_id, content, created_at")
      .or(`sender_id.eq.${userId}`); // Needs adaptation based on DB schemas

    if (error) {
      throw createHttpError(500, `Failed to retrieve conversations: ${error.message}`);
    }
    return data;
  }

  /**
   * Sends an in-app message and dispatches an FCM notification to the receiver.
   */
  static async sendMessage(jobId: string, senderId: string, receiverId: string, content: string, image_urls: string[] = []) {
    const { data: message, error } = await supabase
      .from("messages")
      .insert({
        job_id: jobId,
        sender_id: senderId,
        content,
        image_urls,
      })
      .select()
      .single();

    if (error) {
      throw createHttpError(500, `Failed to send message: ${error.message}`);
    }

    // Trigger asynchronous background notification dispatch
    NotifyService.sendToUser(
      receiverId, 
      "New Message", 
      content.length > 50 ? `${content.substring(0, 47)}...` : content,
      { jobId, click_action: "FLUTTER_NOTIFICATION_CLICK" }
    );

    return message;
  }
}
```

---

## 5. Standardized Integration Rules

To ensure our separately built modules unify seamlessly on execution, we agree to these design contracts:

### 5.1 Standard Response & Error Format
All controllers must delegate error responses to Kwabena's global handler.

* **Format for 2xx Success**:
  ```json
  {
    "success": true,
    "data": { ... }
  }
  ```

* **Format for 4xx/5xx Errors** (automatically processed by `globalerrorHandler.ts`):
  ```json
  {
    "error": "Short human-readable error description here.",
    "code": "ERR_SPECIFIC_CODE"
  }
  ```
  *Rule*: Teammates must throw standard `http-errors` containing exact status codes rather than returning custom raw status numbers.

### 5.2 Git Collaboration Rules
1. **Branch Names**: Standardize branch prefixes based on feature mapping:
   * Kwabena: `feat/backend/core-foundation`
   * Peniel: `feat/backend/workers-matching`
   * Nhyira: `feat/backend/jobs-messaging`
2. **Double-Check Before Pushing**:
   ```bash
   # Confirm that no local .env or generated build outputs are staged
   git status
   ```
3. **Weekly Integration Checks**:
   At the end of each milestone cycle, team members will run the verification checklist together:
   - Ensure `supabase/types.ts` is generated and committed to type-check controllers.
   - Run `npm run build` to verify clean compilation before merging.
   - Verify endpoints using the Swagger interface or the shared Postman collection.
