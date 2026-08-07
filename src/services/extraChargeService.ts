import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";
import * as negotiationEngine from "./negotiationEngine";

export async function requestExtraCharge(jobId: string, workerId: string, amount: number, description: string) {
  // 1. Fetch job to verify status and worker assignment
  const { data: job, error: jobError } = await supabaseAdmin
    .from("jobs")
    .select("id, worker_id, status")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) throw appError(500, jobError.message, "JOB_FETCH_FAILED");
  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");
  if (job.worker_id !== workerId) {
    throw appError(403, "Only the assigned worker can request extra charges", "FORBIDDEN");
  }

  // Allow extra charges in progressed states
  const allowedStatuses = ["arrived", "in_progress", "matched"];
  if (!allowedStatuses.includes(job.status)) {
    throw appError(409, "Extra charges can only be requested after a job is booked and active", "INVALID_JOB_STATE");
  }

  // 2. Propose extra charge using negotiation engine
  return negotiationEngine.createNegotiation({
    jobId,
    type: "extra_charge",
    initiatorId: workerId,
    initialAmount: amount,
    description
  });
}

export async function getOutstandingExtraCharges(jobId: string) {
  const { data, error } = await supabaseAdmin
    .from("negotiations")
    .select("*")
    .eq("job_id", jobId)
    .eq("type", "extra_charge")
    .eq("status", "accepted");

  if (error) throw appError(500, error.message, "FETCH_EXTRA_CHARGES_FAILED");
  return data ?? [];
}

export async function getTotalExtraCharges(jobId: string): Promise<number> {
  const charges = await getOutstandingExtraCharges(jobId);
  return charges.reduce((sum, charge) => sum + Number(charge.agreed_amount || 0), 0);
}
