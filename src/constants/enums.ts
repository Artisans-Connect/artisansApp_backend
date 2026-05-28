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
  DEFAULT_RADIUS_KM: 15,
} as const;
