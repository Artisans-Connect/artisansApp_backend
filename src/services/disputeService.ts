import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";
import { logger } from "../utils/logger";
import * as walletService from "./walletService";

export interface CreateDisputePayload {
  userId: string;
  jobId: string;
  reason: string;
  evidencePhotos?: string[];
}

export interface ResolveDisputePayload {
  adminId: string;
  disputeId: string;
  resolutionType: 'full_refund' | 'full_payout' | 'split';
  clientAmount?: number;
  workerAmount?: number;
  notes?: string;
}

export async function createDispute(payload: CreateDisputePayload) {
  const { data: job, error: jobErr } = await supabaseAdmin
    .from("jobs")
    .select("id, client_id, worker_id, title, status")
    .eq("id", payload.jobId)
    .maybeSingle();

  if (jobErr) throw appError(500, jobErr.message, "JOB_FETCH_FAILED");
  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");

  if (job.client_id !== payload.userId && job.worker_id !== payload.userId) {
    throw appError(403, "Unauthorized to raise dispute on this job", "FORBIDDEN");
  }

  const againstUser = payload.userId === job.client_id ? job.worker_id : job.client_id;
  if (!againstUser) {
    throw appError(400, "Cannot raise dispute on unassigned job", "INVALID_DISPUTE");
  }

  const { data: dispute, error: disputeErr } = await supabaseAdmin
    .from("job_disputes")
    .insert({
      job_id: payload.jobId,
      raised_by: payload.userId,
      against_user: againstUser,
      reason: payload.reason,
      evidence_photos: payload.evidencePhotos || [],
      status: "open",
    })
    .select("*")
    .single();

  if (disputeErr) throw appError(500, disputeErr.message, "DISPUTE_CREATE_FAILED");

  // Freeze escrow balance
  await supabaseAdmin
    .from("job_escrow_balances")
    .update({ status: "disputed", updated_at: new Date().toISOString() })
    .eq("job_id", payload.jobId);

  // Update job status to termination_requested or disputed
  await supabaseAdmin
    .from("jobs")
    .update({ status: "termination_requested", updated_at: new Date().toISOString() })
    .eq("id", payload.jobId);

  logger(`Dispute ${dispute.id} created for job ${payload.jobId} by user ${payload.userId}`);
  return dispute;
}

export async function getDisputes(status?: string, limit = 50, offset = 0) {
  let query = supabaseAdmin
    .from("job_disputes")
    .select(`
      *,
      job:jobs (title, client_id, worker_id),
      raised_profile:profiles!job_disputes_raised_by_fkey (full_name, email, phone),
      against_profile:profiles!job_disputes_against_user_fkey (full_name, email, phone)
    `)
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) throw appError(500, error.message, "DISPUTES_FETCH_FAILED");
  return data || [];
}

export async function resolveDispute(payload: ResolveDisputePayload) {
  const { data: dispute, error: disputeErr } = await supabaseAdmin
    .from("job_disputes")
    .select("*, job:jobs(id, client_id, worker_id, title)")
    .eq("id", payload.disputeId)
    .maybeSingle();

  if (disputeErr) throw appError(500, disputeErr.message, "DISPUTE_FETCH_FAILED");
  if (!dispute) throw appError(404, "Dispute record not found", "DISPUTE_NOT_FOUND");
  if (dispute.status === "resolved") {
    throw appError(400, "Dispute has already been resolved", "ALREADY_RESOLVED");
  }

  const { data: escrow } = await supabaseAdmin
    .from("job_escrow_balances")
    .select("*")
    .eq("job_id", dispute.job_id)
    .maybeSingle();

  const totalEscrow = Number(escrow?.held_amount || 0);
  let clientShare = 0;
  let workerShare = 0;

  if (payload.resolutionType === "full_refund") {
    clientShare = totalEscrow;
    workerShare = 0;
  } else if (payload.resolutionType === "full_payout") {
    clientShare = 0;
    workerShare = totalEscrow;
  } else {
    clientShare = Number(payload.clientAmount || 0);
    workerShare = Number(payload.workerAmount || 0);
  }

  const refPrefix = `disp_${dispute.id.substring(0, 8)}_${Date.now()}`;

  // Credit client wallet if share > 0
  if (clientShare > 0 && dispute.job.client_id) {
    await walletService.creditWallet({
      userId: dispute.job.client_id,
      amount: clientShare,
      reference: `${refPrefix}_client`,
      type: "refund",
      jobId: dispute.job_id,
      description: `Dispute Resolution Refund for job: ${dispute.job.title}`,
    });
  }

  // Credit worker wallet if share > 0
  if (workerShare > 0 && dispute.job.worker_id) {
    await walletService.creditWallet({
      userId: dispute.job.worker_id,
      amount: workerShare,
      reference: `${refPrefix}_worker`,
      type: "split_settlement",
      jobId: dispute.job_id,
      description: `Dispute Resolution Payout for job: ${dispute.job.title}`,
    });
  }

  // Update dispute status
  const { data: updatedDispute, error: updateErr } = await supabaseAdmin
    .from("job_disputes")
    .update({
      status: "resolved",
      resolution_type: payload.resolutionType,
      client_amount: clientShare,
      worker_amount: workerShare,
      resolved_by: payload.adminId,
      resolution_notes: payload.notes || "Resolved by Verification Portal Admin",
      resolved_at: new Date().toISOString(),
    })
    .eq("id", payload.disputeId)
    .select("*")
    .single();

  if (updateErr) throw appError(500, updateErr.message, "DISPUTE_RESOLUTION_FAILED");

  // Clear escrow balance
  await supabaseAdmin
    .from("job_escrow_balances")
    .update({
      held_amount: 0,
      refunded_amount: clientShare,
      released_amount: workerShare,
      status: "refunded",
      updated_at: new Date().toISOString(),
    })
    .eq("job_id", dispute.job_id);

  // Close job as cancelled or completed
  await supabaseAdmin
    .from("jobs")
    .update({
      status: clientShare >= workerShare ? "cancelled" : "completed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", dispute.job_id);

  logger(`Dispute ${dispute.id} resolved by admin ${payload.adminId}. Client: GHS ${clientShare}, Worker: GHS ${workerShare}`);
  return updatedDispute;
}
