---
type: "Reference"
title: "Database & Schema"
openwiki_generated: true
---

# Database & Schema

The backend uses a PostgreSQL database hosted on Supabase. This document covers the database configuration, schema migrations, and generated TypeScript types.

## Supabase Database Connection Details
- **Host**: `db.qdeznjpvkhrxesjykovi.supabase.co`
- **Port**: `5432`
- **Database**: `postgres`
- **User**: `postgres`
- **Supabase project Reference**: `qdeznjpvkhrxesjykovi`

Connection credentials and configurations are loaded via the environment variables `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` and instantiated in [src/config/supabase.ts](file:///c:/Users/user/Downloads/FinalYearProject/artisansApp_backend/src/config/supabase.ts).

---

## Key Database Tables

### 1. `profiles`
Represents users (clients and workers) sign-ups in the system. Links directly to Supabase Auth (`auth.users`).
- `id` (uuid, PK): Matches the auth user id.
- `full_name` (text): The user's name.
- `phone_number` (text): Used for verification and messaging.
- `avatar_url` (text): Location of the avatar in Supabase Storage.
- `account_status` (text): Status of account (`active`, `suspended`).
- `suspension_reason` (text): Text description if the account is suspended.

### 2. `categories`
Maintains service catalog categories (e.g., Plumbing, Electrical, Carpentry).
- `id` (uuid, PK)
- `name` (text): Category name.
- `base_fee` (numeric): Default service/dispatch booking fee in GHS (Ghana Cedis).
- `is_active` (boolean): Flag for soft deactivation.
- Supports hierarchical subcategories.

### 3. `workers`
Artisan-specific details linked to the `profiles` table.
- `id` (uuid, PK, FK to profiles)
- `is_available` (boolean): Availability toggle for dispatching.
- `skills` (text[]): Array of specializations.
- `hourly_rate` (numeric): Price per hour.
- `current_location` (geography): PostGIS location point tracking the artisan's active coordinates.

### 4. `jobs`
Maintains client booking requests.
- `id` (uuid, PK)
- `client_id` (uuid, FK to profiles): The booking user.
- `worker_id` (uuid, FK to workers): Assigned artisan.
- `status` (text): Lifecycle enum (`pending`, `accepted`, `in_progress`, `completed`, `cancelled`).
- `location` (geography): PostGIS point of the job location.
- `description` (text): Detailed client request.
- `started_at` (timestamptz): Timestamp of job activation.

### 5. `reviews`
Tracks rating reviews submitted after job completion.
- `id` (uuid, PK)
- `job_id` (uuid, FK to jobs)
- `reviewer_id` (uuid, FK to profiles)
- `reviewee_id` (uuid, FK to profiles)
- `rating` (integer): Value from 1 to 5.
- `comment` (text)

---

## Migrations Workflow
Migrations are managed via the Supabase CLI and are stored under the [supabase/migrations](file:///c:/Users/user/Downloads/FinalYearProject/artisansApp_backend/supabase/migrations) directory.
Recent migration updates:
- **`20260730160000_cascade_user_deletions.sql`**: Configures cascade rules when users are deleted.
- **`20260730161500_cascade_job_cancellations.sql`**: Auto-resolves related records on job cancellations.
- **`20260803170000_deactivate_legacy_flat_categories.sql`**: Soft-deactivates deprecated flat category models.
- **`20260803180000_add_subcategory_base_fees.sql`**: Updates category rules to support base fees per subcategory.

### Schema Type Integrity
Compile-time safety is enforced by TypeScript interfaces generated from the live database. These are located in [supabase/types.ts](file:///c:/Users/user/Downloads/FinalYearProject/artisansApp_backend/supabase/types.ts). When updating the schema, generate new types using the Supabase CLI:
```bash
supabase gen types typescript --project-id qdeznjpvkhrxesjykovi > supabase/types.ts
```
Ensure all route services import these typed schemas from `supabase/types.ts` to prevent runtime schema divergence.
