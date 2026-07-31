# CraftMatch Platform Backend

This is the Node.js Express.js backend for the CraftMatch platform. It coordinates job matching, real-time updates, and push notifications between clients and workers.

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth (JWT verification)
- **Realtime**: Supabase Realtime
- **Push Notifications**: Firebase Cloud Messaging (FCM)
- **Validation**: Zod

## Project Structure

```text
src/
├── config/              # Configuration (env, supabase, firebase)
├── constants/           # Enums and global constants
├── middleware/          # Express middlewares (auth, error handling)
├── routes/              # API Route definitions
├── services/            # Business logic and database interactions
├── types/               # TypeScript type definitions
├── utils/               # Utility functions (haversine, catchAsync, appError)
└── validators/          # Zod validation schemas
```

## Key Services

- **`matchingService`**: Implements the multi-factor Haversine matching algorithm and multi-round dispatch logic.
- **`jobsService`**: Manages job lifecycle (creation, cancellation, completion).
- **`workersService`**: Handles worker location, availability, and job acceptance.
- **`notifyService`**: Manages FCM push notifications for various platform events.
- **`profilesService`**: Manages user profiles and worker-specific data.

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- npm or yarn

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables:
   Copy `.env.example` to `.env` and fill in the required values:
   ```bash
   cp .env.example .env
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. Start in development mode:
   ```bash
   npm run dev
   ```

## API Documentation

For a detailed breakdown of available endpoints and architecture, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Maintained Backend Wiki

OpenWiki maintains an agent-friendly wiki in [`openwiki/`](./openwiki/). It is
intentionally scoped to this backend repository: it does not claim to describe
the mobile/web client or verification portal. The wiki brief in
[`openwiki/INSTRUCTIONS.md`](./openwiki/INSTRUCTIONS.md) defines those boundaries
and tells the generator how to document integrations honestly.

For a local first run:

```bash
npm run docs:wiki:init
```

To refresh it later:

```bash
npm run docs:wiki:update
```

GitHub Actions refreshes the wiki weekly and on demand, then creates or updates
a documentation pull request. Add `OPENROUTER_API_KEY` as a repository Actions
secret; locally the same variable is read from `.env`.

## App Release Delivery

The verification portal reads app download links from:

```text
GET /api/releases/app
```

The endpoint supports two release-delivery modes:

1. Manifest mode for a CI/CD pipeline:
   - Set `CRAFTMATCH_RELEASE_MANIFEST_PATH` to a JSON file written by the release job, or
   - Set `CRAFTMATCH_RELEASE_MANIFEST_JSON` to the same JSON payload.
2. Environment fallback mode:
   - `CRAFTMATCH_ANDROID_DOWNLOAD_URL`
   - `CRAFTMATCH_IOS_DOWNLOAD_URL`
   - `CRAFTMATCH_WINDOWS_DOWNLOAD_URL`
   - `CRAFTMATCH_MACOS_DOWNLOAD_URL`
   - `CRAFTMATCH_WEB_APP_URL` (defaults to `https://artisans-app-frontend.vercel.app/`)
   - Optional: `CRAFTMATCH_APP_VERSION`, `CRAFTMATCH_RELEASE_UPDATED_AT`

Example manifest:

```json
{
  "appName": "CraftMatch",
  "latestVersion": "1.0.3",
  "updatedAt": "2026-07-29T12:00:00.000Z",
  "links": [
    {
      "platform": "android",
      "href": "https://downloads.example.com/craftmatch-1.0.3.apk",
      "version": "1.0.3"
    },
    {
      "platform": "web",
      "href": "https://artisans-app-frontend.vercel.app/",
      "version": "1.0.3"
    }
  ]
}
```

Recommended pipeline shape:

1. Build the app package for each target platform.
2. Upload the package to durable storage or the target store/TestFlight channel.
3. Write or update the release manifest with the new URLs and version.
4. Deploy or refresh the backend environment so `/api/releases/app` serves the new release.

## Database

The project uses Supabase as its primary database. Migrations and types are located in the `supabase/` directory.

---

*Part of the Artisans Connect Ecosystem.*
