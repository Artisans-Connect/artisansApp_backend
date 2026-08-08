import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";
import * as paystackService from "./paystackService";

export async function releaseEscrowToWorker(jobId: string) {
  const { data: escrow } = await supabaseAdmin
    .from("job_escrow_balances")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle();

  if (!escrow || escrow.status !== "held") {
    logger(`Escrow release skipped for job ${jobId}: status is ${escrow?.status || "not found"}`);
    return;
  }

  const { data: job } = await supabaseAdmin
    .from("jobs")
    .select("worker_id")
    .eq("id", jobId)
    .maybeSingle();

  if (!job?.worker_id) {
    logger(`Escrow release failed: no worker assigned to job ${jobId}`);
    return;
  }

  const { data: payoutDetails } = await supabaseAdmin
    .from("worker_payout_details")
    .select("*")
    .eq("id", job.worker_id)
    .maybeSingle();

  if (!payoutDetails) {
    logger(`Escrow release failed: worker ${job.worker_id} has no payout details configured`);
    await supabaseAdmin
      .from("job_escrow_balances")
      .update({ status: "disputed", updated_at: new Date().toISOString() })
      .eq("job_id", jobId);
    return;
  }

  const platformFeePercentage = 0.10; // 10% fee
  const grossAmount = Number(escrow.held_amount);
  const platformFee = grossAmount * platformFeePercentage;
  const workerPayout = grossAmount - platformFee;

  try {
    let providerCode = "MTN";
    const net = payoutDetails.network.toLowerCase();
    if (net.includes("vodafone") || net.includes("telecel")) {
      providerCode = "VOD";
    } else if (net.includes("airtel") || net.includes("tigo")) {
      providerCode = "ATL";
    }

    const recipientCode = await paystackService.createTransferRecipient(
      payoutDetails.account_name,
      payoutDetails.account_number,
      providerCode
    );

    if (!recipientCode) {
      throw new Error("Failed to create transfer recipient on Paystack");
    }

    const reference = `cm_trsf_${Date.now()}`;
    await paystackService.initiateTransfer(
      Math.round(workerPayout * 100),
      recipientCode,
      `Payout for CraftMatch job ${jobId}`,
      reference
    );

    await supabaseAdmin
      .from("job_escrow_balances")
      .update({
        held_amount: 0.00,
        released_amount: grossAmount,
        status: "released",
        updated_at: new Date().toISOString(),
      })
      .eq("job_id", jobId);

    await supabaseAdmin.from("escrow_ledger").insert([
      {
        job_id: jobId,
        amount: workerPayout,
        type: "payout",
        reference: reference,
      },
      {
        job_id: jobId,
        amount: platformFee,
        type: "platform_fee",
        reference: reference,
      }
    ]);

    logger(`Released escrow of GHS ${grossAmount} for job ${jobId}. Worker: ${workerPayout}, Fee: ${platformFee}`);
  } catch (err: any) {
    logger("Paystack Payout Transfer Error:", err.response?.data || err.message);
    await supabaseAdmin
      .from("job_escrow_balances")
      .update({ status: "disputed", updated_at: new Date().toISOString() })
      .eq("job_id", jobId);
  }
}

export async function refundEscrowToClient(jobId: string, refundAmount: number) {
  const { data: escrow } = await supabaseAdmin
    .from("job_escrow_balances")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle();

  if (!escrow || escrow.status !== "held") {
    logger(`Escrow refund skipped: status is ${escrow?.status || "not found"}`);
    return;
  }

  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("reference")
    .eq("job_id", jobId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!payment) {
    logger(`Escrow refund failed: no completed payment reference found for job ${jobId}`);
    return;
  }

  try {
    const reference = `cm_ref_${Date.now()}`;
    await paystackService.initiateRefund(
      payment.reference,
      Math.round(refundAmount * 100),
      `Client refund for job ${jobId}`
    );

    await supabaseAdmin
      .from("job_escrow_balances")
      .update({
        held_amount: 0.00,
        refunded_amount: refundAmount,
        status: "refunded",
        updated_at: new Date().toISOString(),
      })
      .eq("job_id", jobId);

    await supabaseAdmin.from("escrow_ledger").insert({
      job_id: jobId,
      amount: refundAmount,
      type: "refund",
      reference: reference,
    });

    logger(`Refunded GHS ${refundAmount} to client for job ${jobId}`);
  } catch (err: any) {
    logger("Paystack Refund Error:", err.response?.data || err.message);
    await supabaseAdmin
      .from("job_escrow_balances")
      .update({ status: "disputed", updated_at: new Date().toISOString() })
      .eq("job_id", jobId);
  }
}
