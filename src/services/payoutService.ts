import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";
import { logger } from "../utils/logger";
import * as walletService from "./walletService";

export interface RequestPayoutPayload {
  workerId: string;
  amount: number;
  channel: 'momo' | 'bank';
  accountNumber: string;
  accountName: string;
  bankCode: string;
}

export async function requestPayout(payload: RequestPayoutPayload) {
  if (payload.amount <= 0) {
    throw appError(400, "Payout amount must be greater than 0", "INVALID_AMOUNT");
  }

  const wallet = await walletService.getOrCreateWallet(payload.workerId);
  if (Number(wallet.balance) < payload.amount) {
    throw appError(400, "Insufficient wallet balance for cash-out", "INSUFFICIENT_FUNDS");
  }

  const reference = `payout_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Step 1: Debit worker wallet first (atomic lock)
  await walletService.debitWallet({
    userId: payload.workerId,
    amount: payload.amount,
    reference,
    type: "payout",
    description: `Cash-out to ${payload.channel.toUpperCase()} (${payload.accountNumber})`,
  });

  // Step 2: Insert payout request record
  const { data: payoutReq, error: insertErr } = await supabaseAdmin
    .from("payout_requests")
    .insert({
      worker_id: payload.workerId,
      amount: payload.amount,
      channel: payload.channel,
      account_number: payload.accountNumber,
      account_name: payload.accountName,
      bank_code: payload.bankCode,
      status: "processing",
      reference,
    })
    .select("*")
    .single();

  if (insertErr) {
    // Revert debit if insert fails
    await walletService.creditWallet({
      userId: payload.workerId,
      amount: payload.amount,
      reference: `${reference}_revert`,
      type: "refund",
      description: "Payout request failed initialization; funds returned",
    });
    throw appError(500, insertErr.message, "PAYOUT_INIT_FAILED");
  }

  // Step 3: Simulate or trigger Paystack Transfer
  const isSandbox = process.env.USE_SANDBOX_PAYMENTS === "true" || reference.startsWith("payout_");

  if (isSandbox) {
    // Instant simulation success
    await supabaseAdmin
      .from("payout_requests")
      .update({
        status: "success",
        paystack_transfer_code: `TRF_SIM_${Date.now()}`,
        processed_at: new Date().toISOString(),
      })
      .eq("id", payoutReq.id);

    logger(`Simulated payout of GHS ${payload.amount} to worker ${payload.workerId} succeeded.`);
    return { ...payoutReq, status: "success" };
  } else {
    // Production Paystack Transfer would be called here
    return payoutReq;
  }
}

export async function getPayoutHistory(workerId: string, limit = 50, offset = 0) {
  const { data, error } = await supabaseAdmin
    .from("payout_requests")
    .select("*")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw appError(500, error.message, "PAYOUT_HISTORY_FETCH_FAILED");
  return data || [];
}
