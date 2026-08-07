import { supabaseAdmin } from "../config/supabase";
import { logger } from "../utils/logger";

export async function reconcileWalletsAndEscrow() {
  const { data: wallets, error: walletErr } = await supabaseAdmin
    .from("user_wallets")
    .select("id, user_id, balance, held_balance");

  if (walletErr) {
    logger("Audit Wallet Fetch Error:", walletErr.message);
    return { success: false, error: walletErr.message };
  }

  const anomalies: any[] = [];

  for (const wallet of wallets || []) {
    // Sum transactions for this wallet
    const { data: txs } = await supabaseAdmin
      .from("wallet_transactions")
      .select("amount")
      .eq("wallet_id", wallet.id);

    const calculatedBalance = (txs || []).reduce((sum, tx) => sum + Number(tx.amount), 0);
    const actualBalance = Number(wallet.balance);

    if (Math.abs(calculatedBalance - actualBalance) > 0.01) {
      anomalies.push({
        type: "balance_mismatch",
        userId: wallet.user_id,
        walletId: wallet.id,
        actualBalance,
        calculatedBalance,
      });
    }
  }

  logger(`Wallet Audit Complete. Anomalies found: ${anomalies.length}`);
  return {
    success: true,
    totalWalletsAudited: (wallets || []).length,
    anomaliesCount: anomalies.length,
    anomalies,
  };
}
