# Supabase dev seed data

Idempotent demo data for local/staging API and Flutter integration testing.

## Quick start

From `artisansApp_backend/` with a valid `.env`:

```powershell
npm run seed:dev
```

Re-running the command updates the same rows (no duplicates).

Reset demo users/jobs only (keeps categories):

```powershell
npm run seed:reset:dev
npm run seed:dev
```

## Individual scripts

| Command | Purpose |
|---------|---------|
| `npm run seed:categories` | 20 service categories only |
| `npm run seed:workers` | 10 demo workers (auth + profile + worker + verification) |
| `npm run seed:dev` | Full graph: categories, 2 clients, 10 workers, 7 jobs, messages, 1 review, 2 applications |
| `npm run seed:reset:dev` | Remove demo users/jobs/messages/reviews/applications |
| `npm run seed:verify` | Sign in as demo client and smoke-test profiles, chat, reviews |

## Safety guards

Seeding refuses to run when `NODE_ENV=production` unless `ALLOW_DEV_SEED=true`.

Optional: set `SEED_SUPABASE_PROJECT_REF` to your dev project ref so seeds only run against that Supabase URL.

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `SEED_DEMO_PASSWORD` | `Password123!` | Password for all demo auth users |
| `ALLOW_DEV_SEED` | — | Set `true` to allow seeding in production (not recommended) |
| `SEED_SUPABASE_PROJECT_REF` | — | Optional allowlist check against `SUPABASE_URL` |

## Demo logins

Password: value of `SEED_DEMO_PASSWORD` (default `Password123!`)

**Clients**

- `client.demo@craftmatch.com` — primary client with matched/searching jobs
- `client2.demo@craftmatch.com` — secondary client with in-progress/completed jobs

**Workers** (10 accounts, Kumasi/KNUST area)

- `kwasi.plumber@craftmatch.com`
- `abena.spark@craftmatch.com`
- `kofi.wood@craftmatch.com`
- …see `scripts/seed-data/workers.ts`

## Seeded job statuses

| Status | Count | Notes |
|--------|-------|-------|
| `searching` | 1 | Has pending/declined applications |
| `matching` | 1 | Dispatch in progress |
| `matched` | 1 | Chat thread with Kwasi (plumber) |
| `in_progress` | 1 | Active painting job with messages |
| `completed` | 2 | One reviewed, one without review |
| `cancelled` | 1 | History edge case |

Fixed UUIDs for jobs/users are in `scripts/seed-data/constants.ts` for reproducible re-runs.

## Verification

After seeding (with the API running on port 3000):

```powershell
curl http://localhost:3000/api/categories
npm run seed:verify
```

`seed:verify` signs in as `client.demo@craftmatch.com` and checks:

- `GET /api/profiles/me`
- `GET /api/chat`
- `GET /api/chat/<jobId>/messages` (matched plumbing job from `scripts/seed-data/constants.ts`)
- `GET /api/reviews/worker/<workerId>` (Abena, electrical)

## File layout

```
scripts/
  seed-dev.ts              # Full orchestrator
  seed-reset-dev.ts        # Demo data cleanup
  verify-seed.ts           # Post-seed API smoke test
  seed-categories.ts       # Categories only
  seed-workers.ts          # Workers only
  seed-data/               # Fixtures (fixed UUIDs, emails, job matrix)
  seed-lib/                # Shared seed helpers
supabase/seeds/
  categories.sql           # SQL alternative for categories
  subcategories.sql        # Subcategory catalog (run separately if needed)
```
