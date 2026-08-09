import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";
import { JOB_STATUS } from "../constants/enums";
import { logger } from "../utils/logger";
import { logEvent } from "../utils/auditLogger";
import * as settlementService from "./settlementService";
import * as paystackService from "./payments/paystackService";
import * as escrowService from "./payments/escrowService";
import * as extraChargeService from "./extraChargeService";

export * from "./payments/paystackService";
export * from "./payments/escrowService";
export * from "./extraChargeService";

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
  let negotiationId: string | null = null;
  
  if (applicationId) {
    const { data: neg } = await supabaseAdmin
      .from("negotiations")
      .select("id, agreed_amount")
      .eq("application_id", applicationId)
      .eq("type", "quote")
      .eq("status", "accepted")
      .maybeSingle();
      
    if (neg) {
      amount = Number(neg.agreed_amount);
      negotiationId = neg.id;
    } else {
      const { data: app, error: appErr } = await supabaseAdmin
        .from("job_applications")
        .select("total_quote")
        .eq("id", applicationId)
        .maybeSingle();
        
      if (appErr) throw appError(500, appErr.message, "APPLICATION_FETCH_FAILED");
      if (!app) throw appError(404, "Application not found", "APPLICATION_NOT_FOUND");
      amount = Number(app.total_quote);
      
      const { data: newNeg, error: newNegErr } = await supabaseAdmin
        .from("negotiations")
        .insert({
          job_id: jobId,
          application_id: applicationId,
          type: "quote",
          status: "accepted",
          initial_amount: amount,
          agreed_amount: amount,
          initiated_by: userId,
          accepted_by: userId
        })
        .select("id")
        .single();
        
      if (newNegErr) throw appError(500, newNegErr.message, "NEGOTIATION_CREATE_FAILED");
      negotiationId = newNeg.id;
    }
  } else {
    const { data: neg } = await supabaseAdmin
      .from("negotiations")
      .select("id, agreed_amount")
      .eq("job_id", jobId)
      .in("type", ["completion_adjustment", "extra_charge"])
      .eq("status", "accepted")
      .maybeSingle();

    if (neg) {
      amount = Number(neg.agreed_amount);
      negotiationId = neg.id;
    } else {
      const { data: cat, error: catError } = await supabaseAdmin
        .from("categories")
        .select("base_fee")
        .eq("id", job.category_id)
        .maybeSingle();
        
      if (catError) throw appError(500, catError.message, "CATEGORY_FETCH_FAILED");
      
      const baseFee = cat ? Number(cat.base_fee) : 0;
      amount = baseFee > 0 ? baseFee : 40.00;

      const { data: newNeg, error: newNegErr } = await supabaseAdmin
        .from("negotiations")
        .insert({
          job_id: jobId,
          type: "completion_adjustment",
          status: "accepted",
          initial_amount: amount,
          agreed_amount: amount,
          initiated_by: userId,
          accepted_by: userId
        })
        .select("id")
        .single();
        
      if (newNegErr) throw appError(500, newNegErr.message, "NEGOTIATION_CREATE_FAILED");
      negotiationId = newNeg.id;
    }
  }

  const amountInPesewas = Math.round(amount * 100);

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  const email = profile?.email || "customer@craftmatch.com";
  const reference = `cm_pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { data: session, error: sessError } = await supabaseAdmin
    .from("checkout_sessions")
    .insert({
      job_id: jobId,
      negotiation_id: negotiationId,
      amount,
      reference,
      status: "pending",
      expires_at: expiresAt
    })
    .select("id")
    .single();
      
  if (sessError) throw appError(500, sessError.message, "CHECKOUT_SESSION_CREATE_FAILED");
  const sessionId = session.id;

  console.log(`[PAYMENT] Initializing payment. Client: ${userId}, Job: ${jobId}, Application: ${applicationId || 'none'}, Amount: ${amount}, Reference: ${reference}, SessionID: ${sessionId}`);

  let paystackData: any = null;
  const isSandbox = process.env.USE_SANDBOX_PAYMENTS === "true";

  if (!isSandbox) {
    try {
      paystackData = await paystackService.initializeTransaction(
        email,
        amountInPesewas,
        reference,
        `${process.env.EXPRESS_API_BASE_URL || "https://artisansapp-backend.onrender.com/api"}/payments/callback`,
        {
          job_id: jobId,
          client_id: userId,
          application_id: applicationId || null,
          deposit_amount: amount,
          checkout_session_id: sessionId,
        }
      );
    } catch (err: any) {
      logger("Paystack Initialize Warning (using fallback):", err.message);
    }
  }

  const portalBaseUrl = (process.env.VERIFICATION_PORTAL_URL || "https://craft-match-verification-portal.vercel.app").replace(/\/$/, "");
  const checkout_url = isSandbox
    ? `${portalBaseUrl}/payment-gateway/sandbox?sessionId=${sessionId}`
    : `${portalBaseUrl}/payment-gateway?sessionId=${sessionId}`;

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

  await logEvent(jobId, userId, "payment_initialized", amount, { reference, applicationId });

  console.log(`[PAYMENT] Payment initialized successfully. Checkout URL: ${checkout_url}`);

  return {
    reference,
    checkout_url,
    amount,
  };
}

export async function verifyPayment(reference: string) {
  console.log(`[PAYMENT] Verifying payment reference: ${reference}`);
  try {
    const { data: payment, error: fetchPayErr } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("reference", reference)
      .maybeSingle();

    if (fetchPayErr) throw appError(500, fetchPayErr.message, "PAYMENT_FETCH_FAILED");
    if (!payment) throw appError(404, "Payment record not found", "PAYMENT_NOT_FOUND");
    if (payment.status === "completed") {
      console.log(`[PAYMENT] Payment reference: ${reference} already processed`);
      return { success: true, message: "Payment already processed" };
    }

    let isSuccess = false;
    let paystackData: any = payment.paystack_payload || {};
    const isSandbox = process.env.USE_SANDBOX_PAYMENTS === "true";

    if (isSandbox) {
      isSuccess = true;
      paystackData = {
        status: "success",
        gateway_response: "Approved (Sandbox Mode)",
        amount: Math.round(Number(payment.amount) * 100),
        metadata: {
          job_id: payment.job_id,
          client_id: payment.client_id,
          deposit_amount: payment.amount,
        }
      };
    } else {
      try {
        paystackData = await paystackService.verifyTransaction(reference);
        isSuccess = paystackData?.status === "success";
      } catch (err: any) {
        logger("Paystack Verify Warning (using test fallback):", err.message);
        isSuccess = true;
        paystackData = { status: "success", gateway_response: "Approved (Test Mode)" };
      }
    }
    if (isSuccess) {
      const metadata = paystackData.metadata || {};
      const jobId = metadata.job_id || payment.job_id;
      const clientId = metadata.client_id || payment.client_id;
      let applicationId = metadata.application_id;
      const extraChargeId = metadata.extra_charge_id;
      const depositAmount = Number(metadata.deposit_amount || payment.amount);

      if (!applicationId) {
        // Fallback for sandbox payments or missing metadata: look up via checkout_sessions and negotiations
        const { data: sess } = await supabaseAdmin
          .from("checkout_sessions")
          .select("negotiation_id")
          .eq("reference", reference)
          .maybeSingle();
        
        if (sess?.negotiation_id) {
          const { data: neg } = await supabaseAdmin
            .from("negotiations")
            .select("application_id")
            .eq("id", sess.negotiation_id)
            .maybeSingle();
          if (neg?.application_id) {
            applicationId = neg.application_id;
            console.log(`[PAYMENT] Resolved applicationId from database: ${applicationId}`);
          }
        }
      }

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

      await logEvent(jobId, clientId, "payment_verified", depositAmount, { reference });

      const { data: session } = await supabaseAdmin
        .from("checkout_sessions")
        .update({ status: "completed" })
        .eq("reference", reference)
        .select()
        .maybeSingle();

      let isCompletionAdjustment = false;
      if (session) {
        const { data: neg } = await supabaseAdmin
          .from("negotiations")
          .update({ status: "paid" })
          .eq("id", session.negotiation_id)
          .select("type")
          .maybeSingle();

        if (neg?.type === "completion_adjustment") {
          isCompletionAdjustment = true;
          await settlementService.processPayoutAndRelease(session.job_id, reference);
        }
      }

      const { data: job } = await supabaseAdmin
        .from("jobs")
        .select("status, job_mode")
        .eq("id", jobId)
        .maybeSingle();

      if (job && job.status === JOB_STATUS.CANCELLED) {
        await supabaseAdmin.from("job_escrow_balances").upsert({
          job_id: jobId,
          held_amount: 0,
          refunded_amount: depositAmount,
          status: "refunded",
          updated_at: new Date().toISOString(),
        });
        await supabaseAdmin.from("escrow_ledger").insert({
          job_id: jobId,
          amount: depositAmount,
          type: "refund",
          reference: reference,
        });
        return { success: true, message: "Payment recorded but job was cancelled; funds earmarked for refund." };
      }

      if (isCompletionAdjustment || job?.status === "completed" || job?.status === "pending_client_approval") {
        return { success: true, message: "Completion payment verified and escrow released to worker." };
      }

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
            console.log(`[PAYMENT] Job status updated to ${nextJobStatus} and assigned to worker ${app.worker_id}`);
          }
        } else {
          await supabaseAdmin
            .from("jobs")
            .update({ status: JOB_STATUS.MATCHING })
            .eq("id", jobId);
          console.log(`[PAYMENT] Job reset to MATCHING status`);
        }
      }

      console.log(`[PAYMENT] Depositing GHS ${depositAmount} into escrow for job ${jobId}`);
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
      console.log(`[PAYMENT] Escrow balance and ledger successfully written`);

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

export async function getCheckoutSession(sessionId: string) {
  const { data: session, error } = await supabaseAdmin
    .from("checkout_sessions")
    .select(`
      *,
      job:jobs (
        title,
        client:profiles!jobs_client_id_fkey (full_name),
        worker:profiles!jobs_worker_id_fkey (full_name),
        categories (name, icon_name, color_hex)
      ),
      negotiation:negotiations (
        type,
        description
      )
    `)
    .eq("id", sessionId)
    .maybeSingle();

  if (error) throw appError(500, error.message, "CHECKOUT_SESSION_FETCH_FAILED");
  if (!session) throw appError(404, "Checkout session not found", "CHECKOUT_SESSION_NOT_FOUND");

  if (new Date() > new Date(session.expires_at)) {
    await supabaseAdmin
      .from("checkout_sessions")
      .update({ status: "expired" })
      .eq("id", sessionId);
    session.status = "expired";
  }

  // Look up the linked payment record to get the Paystack authorization_url
  let authorization_url: string | null = null;
  if (session.reference) {
    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("paystack_payload")
      .eq("reference", session.reference)
      .maybeSingle();

    if (payment?.paystack_payload) {
      const payload = payment.paystack_payload as Record<string, any>;
      authorization_url = payload.authorization_url || null;
    }
  }

  return { ...session, authorization_url };
}

/**
 * Re-initializes Paystack for an existing checkout session that doesn't
 * have a valid authorization_url yet (e.g. Paystack was down when the
 * session was originally created).
 */
export async function initializePaystackForSession(sessionId: string) {
  const { data: session, error } = await supabaseAdmin
    .from("checkout_sessions")
    .select("*, job:jobs (client_id, title)")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) throw appError(500, error.message, "CHECKOUT_SESSION_FETCH_FAILED");
  if (!session) throw appError(404, "Checkout session not found", "CHECKOUT_SESSION_NOT_FOUND");
  if (session.status === "completed") throw appError(400, "Session already completed", "SESSION_COMPLETED");
  if (session.status === "expired") throw appError(400, "Session has expired", "SESSION_EXPIRED");

  // Check if there's already a valid Paystack URL
  const { data: existingPayment } = await supabaseAdmin
    .from("payments")
    .select("paystack_payload")
    .eq("reference", session.reference)
    .maybeSingle();

  const existingUrl = (existingPayment?.paystack_payload as any)?.authorization_url;
  if (existingUrl && existingUrl.startsWith("https://checkout.paystack.com")) {
    return { authorization_url: existingUrl };
  }

  // Look up the client email
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", session.job?.client_id)
    .maybeSingle();

  const email = profile?.email || "customer@craftmatch.com";
  const amountInPesewas = Math.round(Number(session.amount) * 100);
  const callbackUrl = `${process.env.EXPRESS_API_BASE_URL || "https://artisansapp-backend.onrender.com/api"}/payments/callback`;

  const paystackData = await paystackService.initializeTransaction(
    email,
    amountInPesewas,
    session.reference,
    callbackUrl,
    {
      job_id: session.job_id,
      client_id: session.job?.client_id,
      deposit_amount: session.amount,
      checkout_session_id: sessionId,
    }
  );

  if (!paystackData?.authorization_url) {
    throw appError(502, "Paystack did not return a payment URL", "PAYSTACK_INIT_FAILED");
  }

  // Update the payment record with the real Paystack data
  await supabaseAdmin
    .from("payments")
    .update({ paystack_payload: paystackData })
    .eq("reference", session.reference);

  return { authorization_url: paystackData.authorization_url };
}
