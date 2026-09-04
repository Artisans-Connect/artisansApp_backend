import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";
import * as negotiationEngine from "./negotiationEngine";
import * as notifyService from "./notifyService";
import { logEvent } from "../utils/auditLogger";
import * as walletService from "./walletService";
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

  let initialEscrow = baseRate + distanceCost + urgencyPremium;
  if (initialEscrow <= 0) {
    const { data: acceptedApp } = await supabaseAdmin
      .from("job_applications")
      .select("total_quote")
      .eq("job_id", jobId)
      .eq("status", "accepted")
      .maybeSingle();
    if (acceptedApp?.total_quote) {
      initialEscrow = Number(acceptedApp.total_quote);
    }
  }

  // 2. Fetch escrow held amount
  const { data: escrow } = await supabaseAdmin
    .from("job_escrow_balances")
    .select("held_amount")
    .eq("job_id", jobId)
    .maybeSingle();

  let escrowHeld = escrow ? Number(escrow.held_amount || 0) : 0;
  if (escrowHeld <= 0) {
    const { data: ledgerDeposits } = await supabaseAdmin
      .from("escrow_ledger")
      .select("amount")
      .eq("job_id", jobId)
      .eq("entry_type", "deposit");
    if (ledgerDeposits && ledgerDeposits.length > 0) {
      escrowHeld = ledgerDeposits.reduce((sum, d) => sum + Number(d.amount || 0), 0);
    }
  }

  // 3. Fetch accepted/paid extra charges with descriptions
  const { data: extraCharges } = await supabaseAdmin
    .from("negotiations")
    .select("agreed_amount, description, created_at")
    .eq("job_id", jobId)
    .eq("type", "extra_charge")
    .in("status", ["accepted", "paid"]);

  // 4. Fetch pending/open extra charge proposals
  const { data: pendingCharges } = await supabaseAdmin
    .from("negotiations")
    .select("id, initial_amount, description, created_at, initiated_by")
    .eq("job_id", jobId)
    .eq("type", "extra_charge")
    .eq("status", "open");

  const totalExtra = extraCharges ? extraCharges.reduce((sum, c) => sum + Number(c.agreed_amount || 0), 0) : 0;
  const formattedExtraCharges = (extraCharges || []).map((c) => ({
    amount: Number(c.agreed_amount || 0),
    description: c.description || "Extra materials/labor",
    created_at: c.created_at,
  }));
  const formattedPendingCharges = (pendingCharges || []).map((c) => ({
    id: c.id,
    amount: Number(c.initial_amount || 0),
    description: c.description || "Extra materials/labor proposal",
    initiated_by: c.initiated_by,
    created_at: c.created_at,
  }));

  // 4. Find if there is an explicit agreed price override on the whole job
  const { data: finalNeg } = await supabaseAdmin
    .from("negotiations")
    .select("id, agreed_amount, metadata")
    .eq("job_id", jobId)
    .eq("type", "completion_adjustment")
    .eq("status", "accepted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let finalAmount = Math.round((initialEscrow + totalExtra) * 100) / 100;

  // Only override final gross amount if completion_adjustment explicitly represents a whole-job price renegotiation
  if (finalNeg && (finalNeg as any).metadata?.is_gross_override === true && finalNeg.agreed_amount != null) {
    finalAmount = Math.round(Number(finalNeg.agreed_amount) * 100) / 100;
  }

  const platformFee = Math.round((finalAmount * 0.10) * 100) / 100;
  const workerPayout = Math.round((finalAmount - platformFee) * 100) / 100;
  const outstandingBalance = Math.max(0, Math.round((finalAmount - escrowHeld) * 100) / 100);

  return {
    job_id: jobId,
    initial_escrow: initialEscrow,
    urgency_premium: urgencyPremium,
    extra_charges: formattedExtraCharges,
    pending_extra_charges: formattedPendingCharges,
    total_extra_charges: totalExtra,
    escrow_held: escrowHeld,
    gross_amount: finalAmount,
    platform_fee: platformFee,
    worker_payout: workerPayout,
    outstanding_balance: outstandingBalance,
  };
}

export async function processPayoutAndRelease(jobId: string, reference?: string) {
  // Idempotency guard: check if escrow has already been released for this job
  const { data: existingEscrow } = await supabaseAdmin
    .from("job_escrow_balances")
    .select("status, released_amount")
    .eq("job_id", jobId)
    .maybeSingle();

  if (existingEscrow?.status === "released") {
    console.log(`[SETTLEMENT] Escrow already released for job ${jobId}`);
    return {
      success: true,
      worker_payout: Number(existingEscrow.released_amount || 0),
      outstanding_balance: 0,
      already_released: true,
    };
  }

  // 1. Fetch details
  const { worker_payout, gross_amount, platform_fee, outstanding_balance } = await calculateSettlement(jobId);

  // Atomic state lock: prevent concurrent releases
  const { data: lockedEscrow } = await supabaseAdmin
    .from("job_escrow_balances")
    .update({
      held_amount: 0,
      released_amount: worker_payout,
      status: "released",
      updated_at: new Date().toISOString(),
    })
    .eq("job_id", jobId)
    .neq("status", "released")
    .select()
    .maybeSingle();

  if (!lockedEscrow && existingEscrow != null) {
    console.log(`[SETTLEMENT] Concurrent escrow release prevented for job ${jobId}`);
    return {
      success: true,
      worker_payout,
      outstanding_balance: 0,
      already_released: true,
    };
  }

  const { data: job } = await supabaseAdmin
    .from("jobs")
    .select("id, worker_id, client_id, title")
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

  // 4. Update Escrow ledger & credit worker wallet
  await walletService.creditWallet({
    userId: job.worker_id,
    amount: worker_payout,
    reference: reference || `cm_release_${Date.now()}`,
    type: "escrow_release",
    description: `Artisan payout for job completion: ${job.title || 'Service'}`,
    jobId: jobId,
    metadata: {
      gross_amount,
      platform_fee,
      worker_payout,
      job_title: job.title,
    },
  });

  // Decrement client's held escrow balance in wallet
  try {
    const clientWallet = await walletService.getOrCreateWallet(job.client_id);
    const currentHeld = Number(clientWallet.held_balance || 0);
    if (currentHeld > 0) {
      await supabaseAdmin
        .from("user_wallets")
        .update({
          held_balance: Math.max(0, Number((currentHeld - gross_amount).toFixed(2))),
          updated_at: new Date().toISOString(),
        })
        .eq("id", clientWallet.id);
    }
  } catch (err: any) {
    console.error("Warning: failed to decrement client held balance:", err.message);
  }


  await supabaseAdmin.from("escrow_ledger").insert({
    job_id: jobId,
    amount: worker_payout,
    type: "release_to_worker",
    reference: reference || `cm_release_${Date.now()}`,
  });

  // 5. Complete job status & release worker availability
  await supabaseAdmin
    .from("jobs")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", jobId);

  await supabaseAdmin
    .from("workers")
    .update({ is_available: true, updated_at: new Date().toISOString() })
    .eq("id", job.worker_id);

  await logEvent(jobId, job.client_id, "escrow_released", worker_payout, { worker_id: job.worker_id, platform_fee });

  await notifyService.notifyJobCompleted(job.client_id, jobId);
  return { success: true, worker_payout, outstanding_balance };
}
