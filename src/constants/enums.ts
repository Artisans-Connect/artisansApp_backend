export const JOB_STATUS = {
  DRAFT: "draft",
  SEARCHING: "searching",
  MATCHING: "matching",
  MATCHED: "matched",
  ON_THE_WAY: "on_the_way",
  ARRIVED: "arrived",
  IN_PROGRESS: "in_progress",
  TERMINATION_REQUESTED: "termination_requested",
  PENDING_CLIENT_APPROVAL: "pending_client_approval",
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
  LOCATION_STALE_MS: 15 * 60 * 1000,
  /** ASAP jobs: DB cron safety net via expires_at */
  JOB_EXPIRES_MINUTES: 45,
} as const;

export const CANCELLATION_STAGE = {
  FREE: "free",
  WARNING: "warning",
  TRAVEL_COMPENSATION: "travel_compensation",
  SIGNIFICANT_FEE: "significant_fee",
  TERMINATION_REQUESTED: "termination_requested",
} as const;

export const CANCELLATION_FEES = {
  TRAVEL_RATE_PER_KM: 3.0,
  ARRIVED_FEE_PERCENT: 0.30,
  ARRIVED_FEE_MINIMUM: 30,
  ARRIVED_FEE_MAXIMUM: 150,
  GRACE_PERIOD_MS: 2 * 60 * 1000, // 2 minutes
} as const;
