export const JOB_STATUS = {
  DRAFT: "draft",
  SEARCHING: "searching",
  MATCHING: "matching",
  MATCHED: "matched",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
} as const;

export const JOB_MODE = {
  ASAP: "asap",
  SCHEDULED: "scheduled",
  FLEXIBLE: "flexible",
} as const;

export const MATCHING = {
  MAX_ROUNDS: 3,
  WORKERS_PER_ROUND: 3,
  ROUND_TIMEOUT_MS: 90_000,
  /** Iterative search: start tight, expand when no candidates */
  RADIUS_STEPS_KM: [5, 10, 15, 25] as const,
  LOCATION_STALE_MS: 2 * 60 * 1000,
  /** ASAP jobs: DB cron safety net via expires_at */
  JOB_EXPIRES_MINUTES: 45,
} as const;
