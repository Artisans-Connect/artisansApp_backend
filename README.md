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

## Database

The project uses Supabase as its primary database. Migrations and types are located in the `supabase/` directory.

---

*Part of the Artisans Connect Ecosystem.*
