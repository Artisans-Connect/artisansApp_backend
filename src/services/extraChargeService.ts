import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";
import * as negotiationEngine from "./negotiationEngine";

export async function requestExtraCharge(jobId: string, workerId: string, amount: number, description: string) {
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

  const allowedStatuses = ["arrived", "in_progress", "matched"];
  if (!allowedStatuses.includes(job.status)) {
    throw appError(409, "Extra charges can only be requested after a job is booked and active", "INVALID_JOB_STATE");
  }

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

export async function proposeExtraCharge(userId: string, jobId: string, amount: number, description: string, proposedBy: "worker" | "client") {
  const negotiation = await negotiationEngine.createNegotiation({
    jobId,
    type: "extra_charge",
    initiatorId: userId,
    initialAmount: amount,
    description
  });

  return {
    id: negotiation.id,
    job_id: jobId,
    requested_amount: amount,
    proposed_by: proposedBy,
    status: negotiation.status === "open" ? (proposedBy === "worker" ? "pending" : "countered") : negotiation.status,
    description
  };
}

export async function acceptExtraCharge(userId: string, extraChargeId: string) {
  const negotiation = await negotiationEngine.acceptCurrentProposal(extraChargeId, userId);

  return {
    id: negotiation.id,
    job_id: negotiation.job_id,
    requested_amount: Number(negotiation.agreed_amount),
    proposed_by: negotiation.initiated_by === userId ? "client" : "worker",
    status: negotiation.status,
    description: negotiation.description
  };
}

export async function counterExtraCharge(userId: string, extraChargeId: string, amount: number) {
  const negotiation = await negotiationEngine.proposeAmount(extraChargeId, userId, amount, "Counter-offer");

  const proposedBy = userId === negotiation.accepted_by ? "client" : "worker";

  return {
    id: negotiation.id,
    job_id: negotiation.job_id,
    requested_amount: amount,
    proposed_by: proposedBy,
    status: negotiation.status === "open" ? (proposedBy === "worker" ? "pending" : "countered") : negotiation.status,
    description: negotiation.description
  };
}

export async function initializeExtraChargePayment(userId: string, extraChargeId: string) {
  throw appError(400, "Individual extra charge payment is deprecated. Extra charges must be paid during final job completion settlement.", "DEPRECATED_FLOW");
}
