# Changelog

All notable changes to the CraftMatch API (`artisansApp_backend`).

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note on reconstruction.** Versions below were reconstructed on 2026-08-21 from git
> history (133 commits, 2026-05-26 → 2026-08-16). No git tags existed and
> `package.json` read `"version": "1.0.0"` from the initial commit onward, so these numbers
> were never actually published. Each entry is anchored to a real commit SHA.
>
> **Consumer note.** This API is consumed by `artisansApp_frontend` (Flutter) and
> `CraftMatch_Verification_Portal` (React). Because no versions were published, a real
> compatibility break shipped silently on 2026-08-05 and had to be patched the same day —
> see [0.8.1]. Treat DB migration boundaries as compatibility boundaries.

---

## [Unreleased]

### Security / Compliance
- Escrow and wallet settlement code is implemented but **not cleared for public paid
  launch**. Per `GHANA_LAUNCH_READINESS_AUDIT.md`, no customer funds may be held before a
  Bank of Ghana-approved PSP agreement and Ghana counsel sign-off.

---

## [0.11.0] — 2026-08-14 — Admin authority & operations endpoints
Anchor: `59e05bf`

### Added
- Backend confidence-scoring authority and multipart upload handler for verification
  documents (`1e0dfac`, `4c17756`).
- Dashboard stats aggregator endpoint (`bbd88bd`).
- Broadcast push-notification service endpoint (`c237d0d`).
- Account verification tier override endpoint (`4b57016`).

### Changed
- Supabase report queries parallelized (`59e05bf`).

---

## [0.10.0] — 2026-08-13 — Payment reconciliation
Anchor: `4e30633`

### Added
- Automated payment-reconciliation scheduler task and webhook error handling (`18fc057`).
- `platform` parameter support for dynamic callback pages and checkout links (`be8764d`).

### Changed
- Post-payment callback page themed to brand colours; official favicon (`b11f4ca`, `4e30633`).

---

## [0.9.1] — 2026-08-10 — Paystack reference-resolution patches
Anchor: `dba96f9`

> Ten consecutive fix commits over 2026-08-09/10 all addressing one defect class:
> payment reference resolution. This is the clearest single example in the history of a
> patch release that should have been cut and never was.

### Fixed
- Paystack `authorization_url` included in the checkout-session response (`eabffd6`).
- Paystack initialization error messages surfaced clearly (`2c549d3`).
- `currency: GHS` added to the Paystack initialize payload (`f0f285b`).
- Fresh reference generated on retry to prevent duplicate-reference errors (`0ebf65d`).
- Auto deep-link on the payment success page with a fallback close button (`534da1c`).
- Updated checkout reference resolved in `verifyPayment` (`d5da421`, `6958054`, `429dec3`).
- Payment verification supports job ID or payment UUID (`dba96f9`).

### Added
- Paystack retry endpoint for checkout sessions (`b0d62e2`).
- `check_payments` diagnostic script (`fde9ee0`).

### Changed
- Worker online-toggle behaviour and admin blocked-accounts view (`6e65307`).

---

## [0.9.0] — 2026-08-09 — Wallet, disputes & auto-release
Anchor: `d6b2d31`

### Added
- Wallet service, dispute management, auto-release scheduler and audit logging (`a96d295`).
- Modular OpenAPI specs; wallet and escrow settlement services enhanced (`d6b2d31`).
- Trust & safety: reports service, routes, validators and DB migrations (`bfce67e`).

### Changed
- Payments, matching and worker services modularized into dedicated submodules (`323cf37`).

---

## [0.8.1] — 2026-08-06 — Compatibility patch
Anchor: `c1c949b`

> **This is the version skew incident.** `ed41eeb` (0.8.0) made a configured
> `PAYSTACK_SECRET_KEY` effectively mandatory for job creation, breaking clients that had
> not shipped the matching update. `0d2756d` — *"add PAYSTACK_SECRET_KEY guard to createJob
> for backward compatibility with un-updated frontends"* — is a backward-compatibility
> shim for a break that a published version number would have made visible in advance.

### Fixed
- `PAYSTACK_SECRET_KEY` guard on `createJob` for backward compatibility with un-updated
  frontends (`0d2756d`).
- Graceful fallback for payment init/verification when the Paystack key is unconfigured
  (`c05dcc1`).
- Initial job status set to `searching` so matching dispatches run immediately (`483a943`).
- `category_id` column resolved in the `initializePayment` query (`87fd0e7`).
- Syntax error in the `verifyPayment` function body (`0c637aa`).
- Default portal URL fallback points at the live Vercel portal (`ebb18e7`).
- Negotiation type synced to `completion_adjustment`; idempotency middleware async
  execution hardened (`4f5e463`).
- Accepted negotiations auto-created on checkout-session initialization (`c1c949b`).

### Added
- Negotiation engine, extra charges and payment idempotency hardening (`33f4541`).
- Bargaining fields `counter_rate` and `last_proposed_by` in application listings (`4047159`).
- Job-completion notifications to both parties on approval (`4a695d9`, `890ffe4`).

---

## [0.8.0] — 2026-08-05 — Paystack payments & escrow ledgers
Anchor: `ed41eeb`

### Added
- Paystack payments, escrow ledgers and worker payout configuration (`ed41eeb`).
  Migration: `20260805120000_payments_and_escrow.sql`.

### Changed
- **BREAKING (unannounced at the time):** job creation began requiring Paystack
  configuration, breaking older clients. Patched hours later in [0.8.1].

---

## [0.7.0] — 2026-08-03 — Category taxonomy migration & pricing
Anchor: `106f461`

### Added
- Booking-history pagination in routes and services (`00a8235`).
- Base-price editing with robust category fallback resolution (`a21f7a0`).
- Subcategory base-fee migration and pricing updates (`106f461`).

### Removed
- **BREAKING:** legacy flat category rows deactivated and deleted from Supabase
  (`d1da15e`, `1ff2340`). Migration `20260803170000_deactivate_legacy_flat_categories.sql`.
  Clients holding cached legacy category IDs required the matching frontend update.

---

## [0.6.0] — 2026-07-30 — Release delivery, cascades & payload enrichment
Anchor: `c50d0dc`

### Added
- Release delivery API endpoint (`GET /releases/app`) and documentation (`4928df6`).
  Serves `latestVersion`, defaulting to the literal `"1.0.0"` when
  `CRAFTMATCH_APP_VERSION` is unset — the mechanism that has been reporting 1.0.0 to users.
- Delete routes and pagination for chats and notifications (`86886d2`).
- Unread message counts, custom proposed rates, aggregated portfolio photos (`00c553a`).
- Job payloads enriched with client review ratings, worker verification status and
  application quotes (`48cdf2e`).
- OAuth metadata field mapping expanded for profile fallback (`81c9e2a`).
- Worker withdrawal of pending applications; cancel in `pending_client_approval` (`952d861`).

### Changed
- **BREAKING (schema):** `ON DELETE CASCADE` added to user foreign keys and
  `job_cancellations` (`24c1e08`, `15804a2`). Deleting a user now cascades.
- Categories filtered by active subcategories; default web PWA release URL (`ff4859e`).

### Fixed
- Explicit foreign keys hardcoded to fix dynamic SQL mapping (`417d7c2`).
- Worker verification status queried from the `workers` relation (`cd1dad8`).
- Matching search window stays open until a job's `expires_at` (`c50d0dc`).
- Non-existent `updated_at` column removed from `job_applications` updates (`3afda17`).

---

## [0.5.0] — 2026-07-16 — Scheduled jobs, quotes & reliability
Anchor: `0177c77`

### Added
- Scheduled jobs and worker reliability scoring (`0177c77`).
  Migrations: `20260715090000_scheduled_confirmed_enum.sql` and siblings.
- Worker quote functionality (`5a8fddc`).
- Notification payloads refactored; unread count added (`5dfe3af`).
- Job lifecycle and scheduling enhancements (`9033159`).
- Seeding mechanism refactored (`782bfb3`).

---

## [0.4.0] — 2026-07-02 — Matching engine benchmarks & trade intent
Anchor: `0078c46`

### Added
- Reproducible dispatch-evaluation benchmark harness (`b048457`) — the source of the
  46.77 ms median matching figure. Lab measurement, not a service guarantee.
- Job lifecycle, smart search and trade intent services (`0078c46`).
- Worker availability handling after terminal job state (`8ba4b54`).
- Job recovery and redispatch logic (`3f7a959`).

---

## [0.3.0] — 2026-06-25 — Recommendation engine, smart search & settlement
Anchor: `f59f0e4`

### Added
- Recommendation engine for artisan ranking (`21b6d56`) — weighted scoring across distance,
  response rate, rating and reliability, with the verified-artisan tie-break.
- Smart search (`f09ec33`) with a local trade-alias fallback so it degrades gracefully.
- Settlement and rating sync (`2fe6914`).
  Migration: `20260625120000_settlement_and_rating_sync.sql`.
- Job tracking, negotiation and applications support (`f59f0e4`).
- Supabase email templates and configuration (`a272cb4`).
- Google Auth metadata auto-synced to the profiles table (`d9e1b68`).
- Expanded Ghana service catalog (`887e2e1`).

---

## [0.2.0] — 2026-06-12 — Dynamic categories & applications flow
Anchor: `3fdca6b`

### Added
- Dynamic categories with seeds (`bb072f5`, `3fdca6b`).
  Migration: `20260612100000_dynamic_categories.sql`.
- Job applications in-drive flow and admin moderation (`049252a`).
- Client cancellation stages and fee calculation (`6cb37f7`).
- Pending client approval, jobs, chat and notification updates (`b3ace55`).
- Worker cancellation, job reopening (`7ef665e`); dispatch index migration (`74aa5b5`).

---

## [0.1.0] — 2026-06-05 — Core platform services
Anchor: `9226d60`

### Added
- Notifications, persistent dispatches and matching logic (`f69b37e`).
- Worker booking lifecycle, completion logic and job tracking (`f4ce9b0`).
- Verification routes and service for artisan registration (`9226d60`, `dc50380`).
- Direct conversations support (`9dde8c4`).
- Avatar storage bucket migration (`4ea19c9`).
- Swagger/OpenAPI documentation for all routes (`68bd590`).
- Pricing service and migration (`4700f9f`).
- Worker profile, active job, start and history endpoints (`360471c`).

### Fixed
- Missing profile fields in the DB schema; chat route (`bf48bd6`).
- Character limit and worker data pulling limits (`b4e7497`).

---

## [0.0.1] — 2026-05-28 — Backend scaffold
Anchor: `a5f6870`

### Added
- Initial Express/TypeScript project with modular routing (`6f242b6`).
- Initial schema migration and generated types (`5c897e4`).
  Migration: `20260528000000_init_schema.sql`.

### Changed
- Migrated from pnpm to npm (`891cad6`).

---

[Unreleased]: https://github.com/Artisans-Connect/artisansApp_backend/compare/v0.11.0...HEAD
