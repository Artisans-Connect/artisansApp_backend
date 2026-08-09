import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";
import * as notifyService from "./notifyService";
import { logEvent } from "../utils/auditLogger";

export type NegotiationType = 'quote' | 'extra_charge' | 'completion_adjustment';
export type NegotiationStatus = 'open' | 'accepted' | 'rejected' | 'expired' | 'paid';

export interface CreateNegotiationParams {
  jobId: string;
  applicationId?: string;
  type: NegotiationType;
  initiatorId: string;
  initialAmount: number;
  description?: string;
  idempotencyKey?: string;
}

export async function getNegotiationState(negotiationId: string) {
  const { data: negotiation, error } = await supabaseAdmin
    .from("negotiations")
    .select(`
      *,
      rounds:negotiation_rounds(*)
    `)
    .eq("id", negotiationId)
    .maybeSingle();

  if (error) throw appError(500, error.message, "NEGOTIATION_FETCH_FAILED");
  if (!negotiation) throw appError(404, "Negotiation not found", "NEGOTIATION_NOT_FOUND");

  // Sort rounds by round_number ascending
  if (negotiation.rounds) {
    negotiation.rounds.sort((a: any, b: any) => a.round_number - b.round_number);
  }

  return negotiation;
}

export async function getActiveNegotiationsForJob(jobId: string) {
  const { data, error } = await supabaseAdmin
    .from("negotiations")
    .select(`
      *,
      rounds:negotiation_rounds(*)
    `)
    .eq("job_id", jobId)
    .eq("status", "open");

  if (error) throw appError(500, error.message, "NEGOTIATIONS_FETCH_FAILED");

  const negotiations = data ?? [];
  for (const neg of negotiations) {
    if (neg.rounds) {
      neg.rounds.sort((a: any, b: any) => a.round_number - b.round_number);
    }
  }

  return negotiations;
}

export async function createNegotiation(params: CreateNegotiationParams) {
  const { jobId, applicationId, type, initiatorId, initialAmount, description, idempotencyKey } = params;

  if (initialAmount <= 0) {
    throw appError(400, "Initial amount must be greater than zero", "INVALID_AMOUNT");
  }

  // 1. Fetch job to verify existance and participants
  const { data: job, error: jobError } = await supabaseAdmin
    .from("jobs")
    .select("id, client_id, worker_id, status")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError) throw appError(500, jobError.message, "JOB_FETCH_FAILED");
  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");

  // Verify that the initiator is a participant of the job
  // (Or if it's a quote negotiation, they must be the applicant or client)
  if (type === 'quote') {
    if (!applicationId) {
      throw appError(400, "Application ID is required for quote negotiations", "APPLICATION_ID_REQUIRED");
    }
    const { data: app, error: appErrorDetail } = await supabaseAdmin
      .from("job_applications")
      .select("worker_id")
      .eq("id", applicationId)
      .maybeSingle();

    if (appErrorDetail) throw appError(500, appErrorDetail.message, "APPLICATION_FETCH_FAILED");
    if (!app) throw appError(404, "Job application not found", "APPLICATION_NOT_FOUND");

    if (initiatorId !== job.client_id && initiatorId !== app.worker_id) {
      throw appError(403, "Not authorized to initiate this negotiation", "FORBIDDEN");
    }
  } else {
    // For extra charges and completion adjustments, initiator must be client or assigned worker
    if (initiatorId !== job.client_id && initiatorId !== job.worker_id) {
      throw appError(403, "Not authorized to initiate this negotiation", "FORBIDDEN");
    }
  }

  // If idempotencyKey is provided, check if negotiation already exists
  if (idempotencyKey) {
    const { data: existing, error: existError } = await supabaseAdmin
      .from("negotiations")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    
    if (existError) throw appError(500, existError.message, "IDEMPOTENCY_CHECK_FAILED");
    if (existing) {
      return getNegotiationState(existing.id);
    }
  }

  // Check if an open negotiation of the same type already exists for this job to prevent duplicate open sessions
  const { data: existingOpen, error: openCheckError } = await supabaseAdmin
    .from("negotiations")
    .select("id")
    .eq("job_id", jobId)
    .eq("type", type)
    .eq("status", "open")
    .maybeSingle();

  if (openCheckError) throw appError(500, openCheckError.message, "OPEN_NEGOTIATION_CHECK_FAILED");
  if (existingOpen) {
    return getNegotiationState(existingOpen.id);
  }

  // 2. Create the negotiation session
  const { data: negotiation, error: insertError } = await supabaseAdmin
    .from("negotiations")
    .insert({
      job_id: jobId,
      application_id: applicationId || null,
      type,
      status: "open",
      initial_amount: initialAmount,
      initiated_by: initiatorId,
      description,
      idempotency_key: idempotencyKey || null
    })
    .select()
    .single();

  if (insertError) throw appError(500, insertError.message, "NEGOTIATION_CREATE_FAILED");

  // 3. Create round 1
  const { error: roundError } = await supabaseAdmin
    .from("negotiation_rounds")
    .insert({
      negotiation_id: negotiation.id,
      round_number: 1,
      proposed_by: initiatorId,
      proposed_amount: initialAmount,
      note: description || "Negotiation initiated"
    });

  if (roundError) {
    // Rollback negotiation insert manually (cleanup)
    await supabaseAdmin.from("negotiations").delete().eq("id", negotiation.id);
    throw appError(500, roundError.message, "NEGOTIATION_ROUND_CREATE_FAILED");
  }

  // 4. Notifications
  const recipientId = initiatorId === job.client_id ? job.worker_id : job.client_id;
  if (recipientId) {
    const { data: initiatorProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", initiatorId)
      .maybeSingle();

    const senderName = initiatorProfile?.full_name ?? "User";
    if (type === 'extra_charge') {
      await notifyService.sendToUser(recipientId, {
        title: "New Extra Charge Proposed",
        body: `${senderName} proposed an extra charge of GHS ${initialAmount.toFixed(2)}`,
        data: { jobId, negotiationId: negotiation.id, type: "extra_charge" }
      });
    } else if (type === 'completion_adjustment') {
      await notifyService.sendToUser(recipientId, {
        title: "Job Adjustment Proposed",
        body: `${senderName} proposed a final job adjustment of GHS ${initialAmount.toFixed(2)}`,
        data: { jobId, negotiationId: negotiation.id, type: "completion_adjustment" }
      });
    }
  }

  await logEvent(jobId, initiatorId, "negotiation_created", initialAmount, { type, description });

  return getNegotiationState(negotiation.id);
}

export async function proposeAmount(negotiationId: string, proposerId: string, amount: number, note?: string) {
  if (amount <= 0) {
    throw appError(400, "Proposed amount must be greater than zero", "INVALID_AMOUNT");
  }

  const neg = await getNegotiationState(negotiationId);
  if (neg.status !== 'open') {
    throw appError(409, `Negotiation is already closed with status: ${neg.status}`, "NEGOTIATION_CLOSED");
  }

  // Validate limits (max 20 rounds)
  const rounds = neg.rounds ?? [];
  if (rounds.length >= 20) {
    throw appError(409, "Maximum negotiation rounds reached", "MAX_ROUNDS_EXCEEDED");
  }

  // Fetch job to check roles
  const { data: job } = await supabaseAdmin
    .from("jobs")
    .select("client_id, worker_id")
    .eq("id", neg.job_id)
    .single();

  if (!job) throw appError(404, "Associated job not found", "JOB_NOT_FOUND");

  // Determine participant authorization
  if (neg.type === 'quote') {
    const { data: app } = await supabaseAdmin
      .from("job_applications")
      .select("worker_id")
      .eq("id", neg.application_id)
      .single();
    if (!app) throw appError(404, "Associated application not found", "APPLICATION_NOT_FOUND");
    if (proposerId !== job.client_id && proposerId !== app.worker_id) {
      throw appError(403, "Not authorized to negotiate", "FORBIDDEN");
    }
  } else {
    if (proposerId !== job.client_id && proposerId !== job.worker_id) {
      throw appError(403, "Not authorized to negotiate", "FORBIDDEN");
    }
  }

  // Verify it's the proposer's turn
  const lastRound = rounds[rounds.length - 1];
  if (lastRound && lastRound.proposed_by === proposerId) {
    throw appError(409, "It is not your turn to propose a counter-offer", "NOT_YOUR_TURN");
  }

  // Verify amount is different from the previous round
  if (lastRound && Number(lastRound.proposed_amount) === amount) {
    throw appError(400, "Proposed amount must be different from the previous offer", "DUPLICATE_OFFER_AMOUNT");
  }

  const nextRoundNumber = rounds.length + 1;

  // Insert the counter round
  const { error: roundError } = await supabaseAdmin
    .from("negotiation_rounds")
    .insert({
      negotiation_id: negotiationId,
      round_number: nextRoundNumber,
      proposed_by: proposerId,
      proposed_amount: amount,
      note: note || `Counter offer proposed: ${amount}`
    });

  if (roundError) throw appError(500, roundError.message, "NEGOTIATION_ROUND_CREATE_FAILED");

  // Notify recipient
  const recipientId = proposerId === job.client_id ? (job.worker_id || neg.rounds[0].proposed_by) : job.client_id;
  if (recipientId) {
    const { data: proposerProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", proposerId)
      .maybeSingle();

    const senderName = proposerProfile?.full_name ?? "User";
    await notifyService.sendToUser(recipientId, {
      title: "New Counter-Offer Received",
      body: `${senderName} countered with GHS ${amount.toFixed(2)}`,
      data: { jobId: neg.job_id, negotiationId, type: neg.type }
    });
  }

  await logEvent(neg.job_id, proposerId, "negotiation_countered", amount, { roundNumber: nextRoundNumber, note });

  return getNegotiationState(negotiationId);
}

export async function acceptCurrentProposal(negotiationId: string, acceptorId: string) {
  const neg = await getNegotiationState(negotiationId);
  if (neg.status !== 'open') {
    throw appError(409, "Negotiation is already closed", "NEGOTIATION_CLOSED");
  }

  const rounds = neg.rounds ?? [];
  const lastRound = rounds[rounds.length - 1];
  if (!lastRound) throw appError(400, "No offer available to accept", "NO_OFFER_FOUND");

  // Acceptor must not be the one who proposed the last offer
  if (lastRound.proposed_by === acceptorId) {
    throw appError(409, "You cannot accept your own proposal", "CANNOT_ACCEPT_OWN_OFFER");
  }

  // Fetch job
  const { data: job } = await supabaseAdmin
    .from("jobs")
    .select("client_id, worker_id")
    .eq("id", neg.job_id)
    .single();

  if (!job) throw appError(404, "Associated job not found", "JOB_NOT_FOUND");

  // Update status to accepted
  const agreedAmount = Number(lastRound.proposed_amount);
  const now = new Date().toISOString();

  const { data: updatedNeg, error: updateError } = await supabaseAdmin
    .from("negotiations")
    .update({
      status: "accepted",
      agreed_amount: agreedAmount,
      accepted_by: acceptorId,
      updated_at: now
    })
    .eq("id", negotiationId)
    .select()
    .single();

  if (updateError) throw appError(500, updateError.message, "NEGOTIATION_ACCEPT_FAILED");

  await logEvent(neg.job_id, acceptorId, "negotiation_accepted", agreedAmount, { type: neg.type });

  if (neg.type === 'extra_charge') {
    // Expire any other remaining open extra charge negotiations for this job to clean up stale duplicates
    await supabaseAdmin
      .from("negotiations")
      .update({ status: "expired", updated_at: now })
      .eq("job_id", neg.job_id)
      .eq("type", "extra_charge")
      .eq("status", "open")
      .neq("id", negotiationId);
  }

  // Perform post-acceptance callbacks depending on the type
  if (neg.type === 'quote') {
    // Update the job application quote and transition job status
    const { error: appUpdateError } = await supabaseAdmin
      .from("job_applications")
      .update({
        status: "accepted",
        total_quote: agreedAmount
      })
      .eq("id", neg.application_id);

    if (appUpdateError) throw appError(500, appUpdateError.message, "APPLICATION_STATUS_UPDATE_FAILED");

    // Decline other applications for this job
    await supabaseAdmin
      .from("job_applications")
      .update({ status: "declined" })
      .eq("job_id", neg.job_id)
      .neq("id", neg.application_id)
      .eq("status", "pending");

    // Fetch worker_id from the accepted application
    const { data: app } = await supabaseAdmin
      .from("job_applications")
      .select("worker_id")
      .eq("id", neg.application_id)
      .single();

    if (app) {
      // Transition job to awaiting_payment
      const { error: jobUpdateError } = await supabaseAdmin
        .from("jobs")
        .update({
          status: "awaiting_payment",
          worker_id: app.worker_id,
          updated_at: now
        })
        .eq("id", neg.job_id);

      if (jobUpdateError) throw appError(500, jobUpdateError.message, "JOB_STATUS_UPDATE_FAILED");

      // Notify worker that their quote was accepted and is awaiting payment
      await notifyService.notifyWorkerApplicationAccepted(app.worker_id, neg.job_id);
    }
  } else if (neg.type === 'extra_charge') {
    // Extra charge accepted, wait for payment (though it goes to settlement, if sandbox or escrow changes, we tag it)
    // Send notification
    const recipientId = acceptorId === job.client_id ? job.worker_id : job.client_id;
    if (recipientId) {
      await notifyService.sendToUser(recipientId, {
        title: "Extra Charge Accepted",
        body: `The extra charge of GHS ${agreedAmount.toFixed(2)} was accepted.`,
        data: { jobId: neg.job_id, negotiationId, type: "extra_charge" }
      });
    }
  } else if (neg.type === 'completion_adjustment') {
    // Completion adjustment accepted
    const recipientId = acceptorId === job.client_id ? job.worker_id : job.client_id;
    if (recipientId) {
      await notifyService.sendToUser(recipientId, {
        title: "Completion Adjustment Accepted",
        body: `The final price adjustment to GHS ${agreedAmount.toFixed(2)} was accepted.`,
        data: { jobId: neg.job_id, negotiationId, type: "completion_adjustment" }
      });
    }
  }

  return getNegotiationState(negotiationId);
}

export async function rejectNegotiation(negotiationId: string, rejectorId: string, reason?: string) {
  const neg = await getNegotiationState(negotiationId);
  if (neg.status !== 'open') {
    throw appError(409, "Negotiation is already closed", "NEGOTIATION_CLOSED");
  }

  // Fetch job
  const { data: job } = await supabaseAdmin
    .from("jobs")
    .select("client_id, worker_id")
    .eq("id", neg.job_id)
    .single();

  if (!job) throw appError(404, "Associated job not found", "JOB_NOT_FOUND");

  const { data: updatedNeg, error: updateError } = await supabaseAdmin
    .from("negotiations")
    .update({
      status: "rejected",
      updated_at: new Date().toISOString()
    })
    .eq("id", negotiationId)
    .select()
    .single();

  if (updateError) throw appError(500, updateError.message, "NEGOTIATION_REJECT_FAILED");

  // Notification
  const recipientId = rejectorId === job.client_id ? (job.worker_id || neg.rounds[0].proposed_by) : job.client_id;
  if (recipientId) {
    const { data: rejectorProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", rejectorId)
      .maybeSingle();

    const senderName = rejectorProfile?.full_name ?? "User";
    await notifyService.sendToUser(recipientId, {
      title: "Negotiation Rejected",
      body: `${senderName} declined the bargaining offer: ${reason || 'No reason provided'}`,
      data: { jobId: neg.job_id, negotiationId, type: neg.type }
    });
  }

  return getNegotiationState(negotiationId);
}
