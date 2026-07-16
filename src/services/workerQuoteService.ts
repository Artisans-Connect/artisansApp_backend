import { supabaseAdmin } from "../config/supabase";
import { JOB_MODE } from "../constants/enums";
import { appError } from "../utils/appError";
import { haversineKm } from "../utils/haversine";
import { isLocationFresh } from "../utils/locationFreshness";

const DEFAULT_BASE_FEE = 60;
const DISTANCE_RATE_PER_KM = 3.0;
const URGENCY_PREMIUM_PERCENT = 0.20;
const QUOTE_CURRENCY = "GHS";

type QuoteJob = {
  id: string;
  category_id: string;
  location_lat: number | null;
  location_lng: number | null;
  job_mode: string | null;
};

type QuoteWorker = {
  id: string;
  current_lat: number | null;
  current_lng: number | null;
  location_at: string | null;
};

export type WorkerApplicationQuote = {
  distance_km: number;
  distance_cost: number;
  base_service_fee: number;
  urgency_premium: number;
  total_quote: number;
  quote_currency: string;
  quoted_at: string;
};

export async function getCategoryBaseFee(categoryId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("categories")
    .select("base_fee")
    .eq("id", categoryId)
    .maybeSingle();

  if (error) throw appError(500, error.message, "CATEGORY_FEE_FETCH_FAILED");
  return data?.base_fee ? Number(data.base_fee) : DEFAULT_BASE_FEE;
}

export function calculateWorkerQuote(
  job: QuoteJob,
  worker: QuoteWorker,
  baseServiceFee: number,
  quotedAt = new Date(),
): WorkerApplicationQuote {
  if (job.location_lat == null || job.location_lng == null) {
    throw appError(400, "Job location is required before pricing", "JOB_LOCATION_REQUIRED");
  }
  if (worker.current_lat == null || worker.current_lng == null || !isLocationFresh(worker.location_at)) {
    throw appError(
      409,
      "Update your location before applying so the client can see an accurate quote.",
      "WORKER_LOCATION_STALE",
    );
  }

  const distanceKmRaw = haversineKm(
    Number(job.location_lat),
    Number(job.location_lng),
    Number(worker.current_lat),
    Number(worker.current_lng),
  );
  const distanceKm = Math.round(distanceKmRaw * 100) / 100;
  const distanceCost = Math.round(distanceKmRaw * DISTANCE_RATE_PER_KM * 100) / 100;
  const subtotal = baseServiceFee + distanceCost;
  const urgencyPremium =
    job.job_mode === JOB_MODE.ASAP ? Math.round(subtotal * URGENCY_PREMIUM_PERCENT * 100) / 100 : 0;
  const totalQuote = Math.round((subtotal + urgencyPremium) * 100) / 100;

  return {
    distance_km: distanceKm,
    distance_cost: distanceCost,
    base_service_fee: Math.round(baseServiceFee * 100) / 100,
    urgency_premium: urgencyPremium,
    total_quote: totalQuote,
    quote_currency: QUOTE_CURRENCY,
    quoted_at: quotedAt.toISOString(),
  };
}

export async function quoteForWorkerApplication(jobId: string, workerId: string): Promise<WorkerApplicationQuote> {
  const [{ data: job, error: jobError }, { data: worker, error: workerError }] = await Promise.all([
    supabaseAdmin
      .from("jobs")
      .select("id, category_id, location_lat, location_lng, job_mode")
      .eq("id", jobId)
      .maybeSingle(),
    supabaseAdmin
      .from("workers")
      .select("id, current_lat, current_lng, location_at")
      .eq("id", workerId)
      .maybeSingle(),
  ]);

  if (jobError) throw appError(500, jobError.message, "JOB_FETCH_FAILED");
  if (workerError) throw appError(500, workerError.message, "WORKER_FETCH_FAILED");
  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");
  if (!worker) throw appError(404, "Worker profile not found", "WORKER_NOT_FOUND");

  const baseServiceFee = await getCategoryBaseFee(job.category_id);
  return calculateWorkerQuote(job, worker, baseServiceFee);
}

export async function quotePreviewForWorker(job: QuoteJob, workerId: string): Promise<WorkerApplicationQuote | null> {
  const { data: worker, error } = await supabaseAdmin
    .from("workers")
    .select("id, current_lat, current_lng, location_at")
    .eq("id", workerId)
    .maybeSingle();

  if (error) throw appError(500, error.message, "WORKER_FETCH_FAILED");
  if (!worker) return null;

  try {
    const baseServiceFee = await getCategoryBaseFee(job.category_id);
    return calculateWorkerQuote(job, worker, baseServiceFee);
  } catch {
    return null;
  }
}
