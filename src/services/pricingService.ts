import { supabaseAdmin } from "../config/supabase";

// Pricing constants
const URGENCY_PREMIUM_PERCENT = 0.20; // +20% for ASAP
const ABSOLUTE_MINIMUM_FEE = 40; // Floor in GH₵
const DEFAULT_BASE_FEE = 60; // Fallback if category has no base_fee

export interface FeeBreakdown {
  base_service_fee: number;
  distance_cost: number;
  urgency_premium: number;
  verification_premium: number;
  verified_worker_market_premium: number;
}

export interface FeeEstimate {
  minimum_fee: number;
  breakdown: FeeBreakdown;
}

export async function estimateFee(
  categoryId: string,
  locationLat: number,
  locationLng: number,
  jobMode: string,
): Promise<FeeEstimate> {
  // 1. Look up category base fee
  const { data: category } = await supabaseAdmin
    .from("categories")
    .select("base_fee")
    .eq("id", categoryId)
    .maybeSingle();

  const baseFee = category?.base_fee
    ? Number(category.base_fee)
    : DEFAULT_BASE_FEE;

  // 2. Worker-distance pricing is locked per worker application. Before a
  // worker applies, there is no reliable travel charge to show.
  const distanceCost = 0;

  // 3. Urgency premium (the only estimate-time premium: it reflects the cost
  // of finding someone quickly, which is known at posting time).
  const subtotal = baseFee + distanceCost;
  const urgencyPremium =
    jobMode === "asap" ? Math.round(subtotal * URGENCY_PREMIUM_PERCENT) : 0;

  // 4. Final minimum fee
  const totalFee = subtotal + urgencyPremium;
  const minimumFee = Math.max(totalFee, ABSOLUTE_MINIMUM_FEE);

  return {
    minimum_fee: minimumFee,
    breakdown: {
      base_service_fee: baseFee,
      distance_cost: distanceCost,
      urgency_premium: urgencyPremium,
      // Kept at 0 for API compatibility. Verification must never raise a
      // client's price, and the mere presence of verified workers nearby is
      // not a service the client received.
      verification_premium: 0,
      verified_worker_market_premium: 0,
    },
  };
}
