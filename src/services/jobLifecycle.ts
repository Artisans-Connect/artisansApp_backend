import { JOB_MODE, JOB_STATUS } from "../constants/enums";

export const SCHEDULED_JOB_ACTIVATION_LEAD_MS = 60 * 60 * 1000;

export const ACTIVE_WORKER_JOB_STATUSES = [
  JOB_STATUS.MATCHED,
  JOB_STATUS.ON_THE_WAY,
  JOB_STATUS.ARRIVED,
  JOB_STATUS.IN_PROGRESS,
  JOB_STATUS.TERMINATION_REQUESTED,
] as const;

export const WORKER_ASSIGNMENT_BLOCKING_JOB_STATUSES = [
  ...ACTIVE_WORKER_JOB_STATUSES,
  JOB_STATUS.PENDING_CLIENT_APPROVAL,
] as const;

export const WORKER_RECOVERABLE_JOB_STATUSES = WORKER_ASSIGNMENT_BLOCKING_JOB_STATUSES;

export const WORKER_ACTIVE_JOB_CONSTRAINT_NAME = "one_active_worker_job_per_worker";

export function statusForNewJob(jobMode: string): string {
  return jobMode === JOB_MODE.SCHEDULED ? JOB_STATUS.DRAFT : JOB_STATUS.SEARCHING;
}

export function shouldDispatchJobOnCreate(jobMode: string, hasRequestedWorker: boolean): boolean {
  if (jobMode === JOB_MODE.SCHEDULED) return false;
  return hasRequestedWorker || jobMode === JOB_MODE.ASAP || jobMode === JOB_MODE.FLEXIBLE;
}

export function shouldActivateScheduledJob(
  scheduledFor: string | null | undefined,
  now = new Date(),
  leadMs = SCHEDULED_JOB_ACTIVATION_LEAD_MS,
): boolean {
  if (!scheduledFor) return false;
  const scheduledAt = new Date(scheduledFor).getTime();
  if (!Number.isFinite(scheduledAt)) return false;
  return scheduledAt <= now.getTime() + leadMs;
}

export function isActiveWorkerJobStatus(status: string | null | undefined): boolean {
  return ACTIVE_WORKER_JOB_STATUSES.includes(status as (typeof ACTIVE_WORKER_JOB_STATUSES)[number]);
}

export function isWorkerAssignmentBlockingStatus(status: string | null | undefined): boolean {
  return WORKER_ASSIGNMENT_BLOCKING_JOB_STATUSES.includes(
    status as (typeof WORKER_ASSIGNMENT_BLOCKING_JOB_STATUSES)[number],
  );
}

export function isWorkerActiveJobConstraintError(error: unknown): boolean {
  const err = error as { code?: string; message?: string; details?: string; hint?: string };
  const text = `${err.message ?? ""} ${err.details ?? ""} ${err.hint ?? ""}`;
  return err.code === "23505" && text.includes(WORKER_ACTIVE_JOB_CONSTRAINT_NAME);
}

export function buildReopenAfterWorkerCancelPatch(updatedAt: string, expiresAt: string | null) {
  return {
    status: JOB_STATUS.MATCHING,
    worker_id: null,
    requested_worker_id: null,
    cancelled_by: null,
    cancelled_reason: null,
    cancelled_at: null,
    cancellation_stage: null,
    cancellation_fee: 0,
    cancellation_fee_currency: "GHS",
    expires_at: expiresAt,
    updated_at: updatedAt,
  };
}
