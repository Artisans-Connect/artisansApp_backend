import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";
import { haversineKm } from "../utils/haversine";
import { workerHasCategorySkill } from "../utils/skillMatch";

// Reference point: Kumasi CBD (city center for distance proxy)
const KUMASI_CBD_LAT = 6.6885;
const KUMASI_CBD_LNG = -1.6244;

// Pricing constants
const DISTANCE_RATE_PER_KM = 3.0; // GH₵ per km
const URGENCY_PREMIUM_PERCENT = 0.20; // +20% for ASAP
const VERIFICATION_PREMIUM_PERCENT = 0.15; // +15% for verified clients
const VERIFIED_WORKER_MARKET_PREMIUM_PERCENT = 0.08; // +8% when verified supply exists nearby
const ABSOLUTE_MINIMUM_FEE = 50; // Floor in GH₵
const DEFAULT_BASE_FEE = 80; // Fallback if category has no base_fee

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
  clientId: string,
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

  // 2. Calculate distance cost (from job location to city center as proxy)
  const distanceKm = haversineKm(
    locationLat,
    locationLng,
    KUMASI_CBD_LAT,
    KUMASI_CBD_LNG,
  );
  const distanceCost = Math.round(distanceKm * DISTANCE_RATE_PER_KM);

  // 3. Check if client is verified
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_verified")
    .eq("id", clientId)
    .maybeSingle();

  const isVerified = profile?.is_verified === true;

  // 4. Calculate premiums
  const subtotal = baseFee + distanceCost;
  const urgencyPremium =
    jobMode === "asap" ? Math.round(subtotal * URGENCY_PREMIUM_PERCENT) : 0;
  const verificationPremium = isVerified
    ? Math.round(subtotal * VERIFICATION_PREMIUM_PERCENT)
    : 0;
  const verifiedWorkerMarketPremium = await hasVerifiedWorkerMarket(
    categoryId,
    locationLat,
    locationLng,
  )
    ? Math.round(subtotal * VERIFIED_WORKER_MARKET_PREMIUM_PERCENT)
    : 0;

  // 5. Final minimum fee
  const totalFee =
    subtotal + urgencyPremium + verificationPremium + verifiedWorkerMarketPremium;
  const minimumFee = Math.max(totalFee, ABSOLUTE_MINIMUM_FEE);

  return {
    minimum_fee: minimumFee,
    breakdown: {
      base_service_fee: baseFee,
      distance_cost: distanceCost,
      urgency_premium: urgencyPremium,
      verification_premium: verificationPremium,
      verified_worker_market_premium: verifiedWorkerMarketPremium,
    },
  };
}

async function hasVerifiedWorkerMarket(
  categoryId: string,
  locationLat: number,
  locationLng: number,
): Promise<boolean> {
  const [{ data: category }, { data: workers, error }] = await Promise.all([
    supabaseAdmin.from("categories").select("name, slug").eq("id", categoryId).maybeSingle(),
    supabaseAdmin
      .from("workers")
      .select("id, current_lat, current_lng, location_at, skills")
      .eq("is_available", true)
      .eq("is_verified", true)
      .limit(50),
  ]);

  if (error) throw appError(500, error.message, "VERIFIED_MARKET_FETCH_FAILED");

  const categoryKey = (category?.slug ?? category?.name ?? "").toLowerCase();
  return (workers ?? []).some((worker) => {
    if (worker.current_lat == null || worker.current_lng == null) return false;
    if (categoryKey && !workerHasCategorySkill(worker.skills, categoryKey)) return false;
    return haversineKm(locationLat, locationLng, worker.current_lat, worker.current_lng) <= 10;
  });
}
