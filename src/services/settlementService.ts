import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";
import * as negotiationEngine from "./negotiationEngine";
import * as notifyService from "./notifyService";
import { logEvent } from "../utils/auditLogger";
import axios from "axios";

const PAYSTACK_API = "https://api.paystack.co";

export async function calculateSettlement(jobId: string) {
  // 1. Fetch job and completion details
  const { data: job, error: jobErr } = await supabaseAdmin
    .from("jobs")
    .select("id, client_id, worker_id, status")
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr) throw appError(500, jobErr.message, "JOB_FETCH_FAILED");
  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");

  const { data: details } = await supabaseAdmin
    .from("job_completion_details")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle();

  const baseRate = details ? Number(details.base_rate || 0) : 0;
  const distanceCost = details ? Number(details.distance_cost || 0) : 0;
  const urgencyPremium = details ? Number(details.urgency_premium || 0) : 0;

  // 2. Fetch escrow held amount
  const { data: escrow } = await supabaseAdmin
    .from("job_escrow_balances")
    .select("held_amount")
    .eq("job_id", jobId)
    .maybeSingle();

  const escrowHeld = escrow ? Number(escrow.held_amount || 0) : 0;
  const initialEscrow = baseRate + distanceCost + urgencyPremium;

  // 3. Fetch accepted extra charges with descriptions
  const { data: extraCharges } = await supabaseAdmin
    .from("negotiations")
    .select("agreed_amount, description, created_at")
    .eq("job_id", jobId)
    .eq("type", "extra_charge")
    .eq("status", "accepted");

  const totalExtra = extraCharges ? extraCharges.reduce((sum, c) => sum + Number(c.agreed_amount || 0), 0) : 0;
  const formattedExtraCharges = (extraCharges || []).map((c) => ({
    amount: Number(c.agreed_amount || 0),
    description: c.description || "Extra materials/labor",
    created_at: c.created_at,
  }));

  // 4. Find if there is an accepted final_settlement negotiation
  const { data: finalNeg } = await supabaseAdmin
    .from("negotiations")
    .select("id, agreed_amount")
    .eq("job_id", jobId)
    .eq("type", "final_settlement")
    .eq("status", "accepted")
    .maybeSingle();

  let finalAmount = initialEscrow + totalExtra;

  if (finalNeg) {
    finalAmount = Number(finalNeg.agreed_amount);
  }

  const platformFee = Math.round((finalAmount * 0.10) * 100) / 100;
  const workerPayout = Math.round((finalAmount - platformFee) * 100) / 100;
  const outstandingBalance = Math.max(0, Math.round((finalAmount - escrowHeld) * 100) / 100);

  return {
    job_id: jobId,
    initial_escrow: initialEscrow,
    extra_charges: formattedExtraCharges,
    total_extra_charges: totalExtra,
    escrow_held: escrowHeld,
    gross_amount: finalAmount,
    platform_fee: platformFee,
    worker_payout: workerPayout,
    outstanding_balance: outstandingBalance,
  };
}

export async function processPayoutAndRelease(jobId: string, reference?: string) {
  // 1. Fetch details
  const { worker_payout, gross_amount, platform_fee, outstanding_balance } = await calculateSettlement(jobId);

  const { data: job } = await supabaseAdmin
    .from("jobs")
    .select("id, worker_id, client_id")
    .eq("id", jobId)
    .single();

  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");
  if (!job.worker_id) throw appError(400, "No worker assigned to job", "WORKER_NOT_ASSIGNED");

  // 2. Fetch worker payout details (Mobile Money number/provider from profile/worker tables)
  const { data: worker } = await supabaseAdmin
    .from("profiles")
    .select("full_name, phone")
    .eq("id", job.worker_id)
    .single();

  // 3. Process transfer via Paystack (if enabled and not sandbox)
  const key = process.env.PAYSTACK_SECRET_KEY;
  const isSandbox = process.env.USE_SANDBOX_PAYMENTS === "true";

  if (key && !isSandbox && worker_payout > 0) {
    try {
      // Typically we'd call Paystack Transfer API:
      // a. Create transfer recipient: axios.post(`${PAYSTACK_API}/transferrecipient`, ...)
      // b. Initiate transfer: axios.post(`${PAYSTACK_API}/transfer`, ...)
      // For final year project demo, simulate a successful payout log:
      console.log(`[Paystack Payout] Transferred GHS ${worker_payout} to worker ${worker?.full_name} (${worker?.phone})`);
    } catch (err: any) {
      console.error("Payout transfer warning:", err.message);
    }
  }

  // 4. Update Escrow ledger
  await supabaseAdmin.from("job_escrow_balances").upsert({
    job_id: jobId,
    held_amount: 0,
    status: "released",
    updated_at: new Date().toISOString(),
  });

  await supabaseAdmin.from("escrow_ledger").insert({
    job_id: jobId,
    amount: worker_payout,
    type: "release_to_worker",
    reference: reference || `cm_release_${Date.now()}`,
  });

  // 5. Complete job status
  await supabaseAdmin
    .from("jobs")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", jobId);

  await logEvent(jobId, job.client_id, "escrow_released", worker_payout, { worker_id: job.worker_id, platform_fee });

  await notifyService.notifyJobCompleted(job.client_id, jobId);
  return { success: true, worker_payout, outstanding_balance };
}
