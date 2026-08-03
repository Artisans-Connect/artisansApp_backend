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
  subcategoryId?: string | null,
): Promise<FeeEstimate> {
  // 1. Look up base fee: check subcategory base_fee first, then parent category base_fee
  let resolvedBaseFee: number | null = null;

  if (subcategoryId) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subcategoryId);
    const subcatQuery = supabaseAdmin.from("subcategories").select("base_fee");
    const { data: subcat } = await (isUuid
      ? subcatQuery.eq("id", subcategoryId)
      : subcatQuery.eq("slug", subcategoryId)
    ).maybeSingle();

    if (subcat?.base_fee != null && Number(subcat.base_fee) > 0) {
      resolvedBaseFee = Number(subcat.base_fee);
    }
  }

  if (resolvedBaseFee == null && categoryId) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId);
    const catQuery = supabaseAdmin.from("categories").select("base_fee");
    const { data: category } = await (isUuid
      ? catQuery.eq("id", categoryId)
      : catQuery.eq("slug", categoryId)
    ).maybeSingle();

    if (category?.base_fee != null && Number(category.base_fee) > 0) {
      resolvedBaseFee = Number(category.base_fee);
    }
  }

  const baseFee = resolvedBaseFee ?? DEFAULT_BASE_FEE;

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
