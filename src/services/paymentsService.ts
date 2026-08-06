import axios from "axios";
import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";
import { JOB_STATUS } from "../constants/enums";
import { logger } from "../utils/logger";
import * as notifyService from "./notifyService";

const PAYSTACK_API = "https://api.paystack.co";

function getPaystackSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw appError(500, "Paystack API key not configured", "PAYMENT_CONFIG_ERROR");
  }
  return key;
}

/**
 * Initializes a transaction on Paystack and records a pending payment.
 */
export async function initializePayment(userId: string, jobId: string, applicationId?: string) {
  const { data: job, error: jobError } = await supabaseAdmin
    .from("jobs")
    .select("id, client_id, status, budget_fixed, job_mode, category_id")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) throw appError(500, jobError.message, "JOB_FETCH_FAILED");
  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");
  if (job.client_id !== userId) throw appError(403, "Unauthorized", "FORBIDDEN");

  let amount = 0;
  
  if (applicationId) {
    const { data: app, error: appErrorMsg } = await supabaseAdmin
      .from("job_applications")
      .select("total_quote")
      .eq("id", applicationId)
      .maybeSingle();
      
    if (appErrorMsg) throw appError(500, appErrorMsg.message, "APPLICATION_FETCH_FAILED");
    if (!app) throw appError(404, "Application not found", "APPLICATION_NOT_FOUND");
    
    // Deposit is 20% of the accepted quote amount
    amount = Number(app.total_quote) * 0.20; 
  } else {
    const { data: cat, error: catError } = await supabaseAdmin
      .from("categories")
      .select("base_fee")
      .eq("id", job.category_id)
      .maybeSingle();
      
    if (catError) throw appError(500, catError.message, "CATEGORY_FETCH_FAILED");
    
    const baseFee = cat ? Number(cat.base_fee) : 0;
    amount = baseFee > 0 ? baseFee : 20.00;
  }

  const amountInPesewas = Math.round(amount * 100);

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  const email = profile?.email || "customer@craftmatch.com";
  const reference = `cm_pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  let paystackData: any = null;
  const key = process.env.PAYSTACK_SECRET_KEY;

  if (key) {
    try {
      const response = await axios.post(
        `${PAYSTACK_API}/transaction/initialize`,
        {
          email,
          amount: amountInPesewas,
          reference,
          callback_url: `${process.env.EXPRESS_API_BASE_URL || "https://artisansapp-backend.onrender.com/api"}/payments/callback`,
          metadata: {
            job_id: jobId,
            client_id: userId,
            application_id: applicationId || null,
            deposit_amount: amount,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
        }
      );
      paystackData = response.data?.data;
    } catch (err: any) {
      logger("Paystack Initialize Warning (using fallback):", err.response?.data || err.message);
    }
  }

  const portalBaseUrl = process.env.VERIFICATION_PORTAL_URL || "http://localhost:5173";
  const checkout_url = `${portalBaseUrl}/payment-gateway?reference=${reference}`;

  if (!paystackData) {
    paystackData = {
      authorization_url: checkout_url,
      reference,
      status: "pending",
    };
  }

  const { error: payError } = await supabaseAdmin.from("payments").insert({
    client_id: userId,
    job_id: jobId,
    amount,
    reference,
    status: "pending",
    paystack_payload: paystackData,
  });

  if (payError) throw appError(500, payError.message, "PAYMENT_RECORD_FAILED");

  return {
    reference,
    checkout_url,
    amount,
  };
}

/**
 * Verifies a transaction reference on Paystack, changes job status, and locks funds in escrow.
 */
export async function verifyPayment(reference: string) {
  try {
    const { data: payment, error: fetchPayErr } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("reference", reference)
      .maybeSingle();

    if (fetchPayErr) throw appError(500, fetchPayErr.message, "PAYMENT_FETCH_FAILED");
    if (!payment) throw appError(404, "Payment record not found", "PAYMENT_NOT_FOUND");
    if (payment.status === "completed") {
      return { success: true, message: "Payment already processed" };
    }

  let isSuccess = false;
  let paystackData: any = payment.paystack_payload || {};
  const key = process.env.PAYSTACK_SECRET_KEY;

  if (key) {
    try {
      const response = await axios.get(`${PAYSTACK_API}/transaction/verify/${reference}`, {
        headers: {
          Authorization: `Bearer ${key}`,
        },
      });
      paystackData = response.data?.data;
      isSuccess = paystackData?.status === "success";
    } catch (err: any) {
      logger("Paystack Verify Warning (using test fallback):", err.response?.data || err.message);
      isSuccess = true;
      paystackData = { status: "success", gateway_response: "Approved (Test Mode)" };
    }
  } else {
    isSuccess = true;
    paystackData = { status: "success", gateway_response: "Approved (Test Mode)" };
  }

  if (isSuccess) {
    const metadata = paystackData.metadata || {};
    const jobId = metadata.job_id || payment.job_id;
    const clientId = metadata.client_id || payment.client_id;
    const applicationId = metadata.application_id;
    const extraChargeId = metadata.extra_charge_id;
    const depositAmount = Number(metadata.deposit_amount || payment.amount);

      if (extraChargeId) {
        const { error: payUpdateErr } = await supabaseAdmin
          .from("payments")
          .update({ status: "completed", paystack_payload: paystackData })
          .eq("reference", reference);

        if (payUpdateErr) throw appError(500, payUpdateErr.message, "PAYMENT_UPDATE_FAILED");

        await supabaseAdmin
          .from("job_extra_charges")
          .update({ status: "paid" })
          .eq("id", extraChargeId);

        const { data: escrow } = await supabaseAdmin
          .from("job_escrow_balances")
          .select("held_amount")
          .eq("job_id", jobId)
          .maybeSingle();

        const currentHeld = escrow ? Number(escrow.held_amount) : 0;
        await supabaseAdmin.from("job_escrow_balances").upsert({
          job_id: jobId,
          held_amount: currentHeld + depositAmount,
          status: "held",
          updated_at: new Date().toISOString(),
        });

        await supabaseAdmin.from("escrow_ledger").insert({
          job_id: jobId,
          amount: depositAmount,
          type: "extra_charge_deposit",
          reference: reference,
        });

        return { success: true, message: "Extra charge payment processed successfully" };
      }

      const { error: payUpdateErr } = await supabaseAdmin
        .from("payments")
        .update({ status: "completed", paystack_payload: paystackData })
        .eq("reference", reference);

      if (payUpdateErr) throw appError(500, payUpdateErr.message, "PAYMENT_UPDATE_FAILED");

      const { data: job } = await supabaseAdmin
        .from("jobs")
        .select("status, job_mode")
        .eq("id", jobId)
        .maybeSingle();

      if (job) {
        let nextJobStatus: string = JOB_STATUS.MATCHING;
        
        if (applicationId) {
          const { data: app } = await supabaseAdmin
            .from("job_applications")
            .select("worker_id")
            .eq("id", applicationId)
            .maybeSingle();

          if (app) {
            const isScheduled = job.job_mode === "scheduled";
            nextJobStatus = isScheduled ? JOB_STATUS.SCHEDULED_CONFIRMED : JOB_STATUS.MATCHED;
            
            await supabaseAdmin
              .from("jobs")
              .update({
                worker_id: app.worker_id,
                status: nextJobStatus,
                updated_at: new Date().toISOString(),
              })
              .eq("id", jobId);

            await supabaseAdmin
              .from("job_applications")
              .update({ status: "accepted" })
              .eq("id", applicationId);

            await supabaseAdmin
              .from("job_applications")
              .update({ status: "declined" })
              .eq("job_id", jobId)
              .neq("id", applicationId)
              .eq("status", "pending");

            if (!isScheduled) {
              await supabaseAdmin
                .from("workers")
                .update({ is_available: false, updated_at: new Date().toISOString() })
                .eq("id", app.worker_id);
            }
            
            await notifyService.notifyWorkerApplicationAccepted(app.worker_id, jobId);
          }
        } else {
          await supabaseAdmin
            .from("jobs")
            .update({ status: JOB_STATUS.MATCHING })
            .eq("id", jobId);
        }
      }

      await supabaseAdmin.from("job_escrow_balances").upsert({
        job_id: jobId,
        held_amount: depositAmount,
        released_amount: 0.00,
        refunded_amount: 0.00,
        status: "held",
      });

      await supabaseAdmin.from("escrow_ledger").insert({
        job_id: jobId,
        amount: depositAmount,
        type: "deposit",
        reference: reference,
      });

      return { success: true, message: "Payment processed successfully" };
    } else {
      await supabaseAdmin
        .from("payments")
        .update({ status: "failed", paystack_payload: paystackData })
        .eq("reference", reference);

      return { success: false, message: `Payment failed: ${paystackData?.status}` };
    }
  } catch (err: any) {
    logger("Paystack Verify Error:", err.response?.data || err.message);
    throw appError(
      err.response?.status || 500,
      err.response?.data?.message || "Failed to verify payment",
      "PAYMENT_VERIFY_ERROR"
    );
  }
}

/**
 * Releases held escrow funds, taking platform fees and sending payouts to worker's Mobile Money.
 */
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
    const key = getPaystackSecretKey();

    let providerCode = "MTN";
    const net = payoutDetails.network.toLowerCase();
    if (net.includes("vodafone") || net.includes("telecel")) {
      providerCode = "VOD";
    } else if (net.includes("airtel") || net.includes("tigo")) {
      providerCode = "ATL";
    }

    const recipientResponse = await axios.post(
      `${PAYSTACK_API}/transferrecipient`,
      {
        type: "mobile_money",
        name: payoutDetails.account_name,
        account_number: payoutDetails.account_number,
        bank_code: providerCode,
        currency: "GHS",
      },
      {
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
      }
    );

    const recipientCode = recipientResponse.data?.data?.recipient_code;
    if (!recipientCode) {
      throw new Error("Failed to create transfer recipient on Paystack");
    }

    const reference = `cm_trsf_${Date.now()}`;
    await axios.post(
      `${PAYSTACK_API}/transfer`,
      {
        source: "balance",
        amount: Math.round(workerPayout * 100),
        recipient: recipientCode,
        reason: `Payout for CraftMatch job ${jobId}`,
        currency: "GHS",
        reference,
      },
      {
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
      }
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

/**
 * Refunds the escrow amount back to the client's original wallet/card.
 */
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
    const key = getPaystackSecretKey();
    const reference = `cm_ref_${Date.now()}`;

    await axios.post(
      `${PAYSTACK_API}/refund`,
      {
        transaction: payment.reference,
        amount: Math.round(refundAmount * 100),
        currency: "GHS",
        merchant_note: `Client refund for job ${jobId}`,
      },
      {
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
      }
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

export async function proposeExtraCharge(userId: string, jobId: string, amount: number, description: string, proposedBy: "worker" | "client") {
  const { data: job, error: jobErr } = await supabaseAdmin
    .from("jobs")
    .select("client_id, worker_id")
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr) throw appError(500, jobErr.message, "JOB_FETCH_FAILED");
  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");
  if (job.client_id !== userId && job.worker_id !== userId) {
    throw appError(403, "Not authorized", "FORBIDDEN");
  }

  await supabaseAdmin
    .from("job_extra_charges")
    .update({ status: "rejected" })
    .eq("job_id", jobId)
    .in("status", ["pending", "countered"]);

  const { data, error } = await supabaseAdmin
    .from("job_extra_charges")
    .insert({
      job_id: jobId,
      requested_amount: amount,
      proposed_by: proposedBy,
      status: proposedBy === "worker" ? "pending" : "countered",
      description,
    })
    .select()
    .single();

  if (error) throw appError(500, error.message, "EXTRA_CHARGE_PROPOSE_FAILED");

  if (proposedBy === "worker") {
    await notifyService.notifyClientExtraChargeProposed(job.client_id, jobId, amount);
  } else {
    await notifyService.notifyWorkerExtraChargeCountered(job.worker_id, jobId, amount);
  }

  return data;
}

export async function acceptExtraCharge(userId: string, extraChargeId: string) {
  const { data: charge, error: chargeErr } = await supabaseAdmin
    .from("job_extra_charges")
    .select("*, jobs(client_id, worker_id)")
    .eq("id", extraChargeId)
    .maybeSingle();

  if (chargeErr) throw appError(500, chargeErr.message, "EXTRA_CHARGE_FETCH_FAILED");
  if (!charge) throw appError(404, "Extra charge request not found", "EXTRA_CHARGE_NOT_FOUND");

  const job = charge.jobs as any;
  if (job.client_id !== userId && job.worker_id !== userId) {
    throw appError(403, "Not authorized", "FORBIDDEN");
  }

  const { data, error } = await supabaseAdmin
    .from("job_extra_charges")
    .update({ status: "accepted" })
    .eq("id", extraChargeId)
    .select()
    .single();

  if (error) throw appError(500, error.message, "EXTRA_CHARGE_ACCEPT_FAILED");

  if (charge.proposed_by === "client" && userId === job.worker_id) {
    await notifyService.notifyClientExtraChargeAccepted(job.client_id, charge.job_id, Number(charge.requested_amount));
  } else if (charge.proposed_by === "worker" && userId === job.client_id) {
    // Proactive notification if client accepts directly
    await notifyService.notifyClientExtraChargeAccepted(job.client_id, charge.job_id, Number(charge.requested_amount));
  }

  return data;
}

export async function counterExtraCharge(userId: string, extraChargeId: string, amount: number) {
  const { data: charge, error: chargeErr } = await supabaseAdmin
    .from("job_extra_charges")
    .select("*, jobs(client_id, worker_id)")
    .eq("id", extraChargeId)
    .maybeSingle();

  if (chargeErr) throw appError(500, chargeErr.message, "EXTRA_CHARGE_FETCH_FAILED");
  if (!charge) throw appError(404, "Extra charge not found", "EXTRA_CHARGE_NOT_FOUND");

  const job = charge.jobs as any;
  if (job.client_id !== userId && job.worker_id !== userId) {
    throw appError(403, "Not authorized", "FORBIDDEN");
  }

  const proposedBy = userId === job.client_id ? "client" : "worker";
  const newStatus = proposedBy === "worker" ? "pending" : "countered";

  const { data, error } = await supabaseAdmin
    .from("job_extra_charges")
    .update({
      requested_amount: amount,
      proposed_by: proposedBy,
      status: newStatus,
    })
    .eq("id", extraChargeId)
    .select()
    .single();

  if (error) throw appError(500, error.message, "EXTRA_CHARGE_COUNTER_FAILED");

  if (proposedBy === "client") {
    await notifyService.notifyWorkerExtraChargeCountered(job.worker_id, charge.job_id, amount);
  } else {
    await notifyService.notifyClientExtraChargeProposed(job.client_id, charge.job_id, amount);
  }

  return data;
}


export async function initializeExtraChargePayment(userId: string, extraChargeId: string) {
  const { data: charge, error: chargeErr } = await supabaseAdmin
    .from("job_extra_charges")
    .select("*, jobs(client_id, title)")
    .eq("id", extraChargeId)
    .maybeSingle();

  if (chargeErr) throw appError(500, chargeErr.message, "EXTRA_CHARGE_FETCH_FAILED");
  if (!charge) throw appError(404, "Extra charge not found", "EXTRA_CHARGE_NOT_FOUND");

  const job = charge.jobs as any;
  if (job.client_id !== userId) throw appError(403, "Unauthorized", "FORBIDDEN");
  if (charge.status !== "accepted") {
    throw appError(400, "Extra charge must be accepted before payment", "INVALID_CHARGE_STATE");
  }

  const amount = Number(charge.requested_amount);
  const amountInPesewas = Math.round(amount * 100);

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  const email = profile?.email || "customer@craftmatch.com";
  const reference = `cm_ext_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  let paystackData: any = null;
  const key = process.env.PAYSTACK_SECRET_KEY;

  if (key) {
    try {
      const response = await axios.post(
        `${PAYSTACK_API}/transaction/initialize`,
        {
          email,
          amount: amountInPesewas,
          reference,
          callback_url: `${process.env.EXPRESS_API_BASE_URL || "https://artisansapp-backend.onrender.com/api"}/payments/callback`,
          metadata: {
            job_id: charge.job_id,
            client_id: userId,
            extra_charge_id: extraChargeId,
            deposit_amount: amount,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
        }
      );
      paystackData = response.data?.data;
    } catch (err: any) {
      logger("Paystack Extra Charge Initialize Warning (using fallback):", err.response?.data || err.message);
    }
  }

  const portalBaseUrl = process.env.VERIFICATION_PORTAL_URL || "http://localhost:5173";
  const checkout_url = `${portalBaseUrl}/payment-gateway?reference=${reference}`;

  if (!paystackData) {
    paystackData = {
      authorization_url: checkout_url,
      reference,
      status: "pending",
    };
  }

  await supabaseAdmin.from("payments").insert({
    client_id: userId,
    job_id: charge.job_id,
    amount,
    reference,
    status: "pending",
    paystack_payload: paystackData,
  });

  return {
    reference,
    checkout_url,
    amount,
  };
}
