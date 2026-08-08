import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";
import { logger } from "../utils/logger";

export interface WalletTransactionPayload {
  userId: string;
  amount: number;
  reference: string;
  type: 'deposit' | 'escrow_lock' | 'escrow_release' | 'refund' | 'payout' | 'cancellation_fee' | 'split_settlement';
  description?: string;
  jobId?: string;
  metadata?: Record<string, any>;
}

export async function getOrCreateWallet(userId: string) {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("user_wallets")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    logger("Wallet Fetch Error:", fetchError.message);
    throw appError(500, fetchError.message, "WALLET_FETCH_FAILED");
  }

  if (existing) return existing;

  const { data: newWallet, error: createError } = await supabaseAdmin
    .from("user_wallets")
    .insert({ user_id: userId, balance: 0.00, held_balance: 0.00 })
    .select("*")
    .single();

  if (createError) {
    logger("Wallet Create Error:", createError.message);
    throw appError(500, createError.message, "WALLET_CREATE_FAILED");
  }

  return newWallet;
}

export async function creditWallet(payload: WalletTransactionPayload) {
  const wallet = await getOrCreateWallet(payload.userId);
  const newBalance = Number((Number(wallet.balance) + payload.amount).toFixed(2));

  const { data: updatedWallet, error: updateError } = await supabaseAdmin
    .from("user_wallets")
    .update({
      balance: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq("id", wallet.id)
    .select("*")
    .single();

  if (updateError) {
    throw appError(500, updateError.message, "WALLET_CREDIT_FAILED");
  }

  await supabaseAdmin.from("wallet_transactions").insert({
    wallet_id: wallet.id,
    user_id: payload.userId,
    job_id: payload.jobId || null,
    type: payload.type,
    amount: payload.amount,
    reference: payload.reference,
    description: payload.description || `Wallet credit: ${payload.type}`,
    metadata: payload.metadata || {},
  });

  return updatedWallet;
}

export async function debitWallet(payload: WalletTransactionPayload) {
  const wallet = await getOrCreateWallet(payload.userId);
  const currentBalance = Number(wallet.balance);

  if (currentBalance < payload.amount) {
    throw appError(400, "Insufficient wallet balance", "INSUFFICIENT_FUNDS");
  }

  const newBalance = Number((currentBalance - payload.amount).toFixed(2));

  const { data: updatedWallet, error: updateError } = await supabaseAdmin
    .from("user_wallets")
    .update({
      balance: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq("id", wallet.id)
    .select("*")
    .single();

  if (updateError) {
    throw appError(500, updateError.message, "WALLET_DEBIT_FAILED");
  }

  await supabaseAdmin.from("wallet_transactions").insert({
    wallet_id: wallet.id,
    user_id: payload.userId,
    job_id: payload.jobId || null,
    type: payload.type,
    amount: -payload.amount,
    reference: payload.reference,
    description: payload.description || `Wallet debit: ${payload.type}`,
    metadata: payload.metadata || {},
  });

  return updatedWallet;
}

export async function getWalletTransactions(userId: string, limit = 50, offset = 0) {
  const wallet = await getOrCreateWallet(userId);

  const { data: transactions, error } = await supabaseAdmin
    .from("wallet_transactions")
    .select("*, job:jobs(title)")
    .eq("wallet_id", wallet.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw appError(500, error.message, "WALLET_TRANSACTIONS_FETCH_FAILED");
  }

  return {
    wallet,
    transactions: transactions || [],
  };
}
