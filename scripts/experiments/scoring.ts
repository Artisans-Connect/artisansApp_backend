/**
 * Weight-parameterised mirror of the production scorer.
 *
 * The real engine (`src/services/recommendationEngine.ts`) hard-codes its
 * three weights as module constants, which is correct for production but
 * prevents sensitivity analysis and ablations. This module reproduces the
 * *exact same formula* with the weights injected, and `assertMatchesEngine()`
 * guards against drift by checking it against the real engine at the true
 * weights. Baselines and sensitivity sweeps use this; the headline "full
 * model" numbers and the latency benchmark use the real engine directly.
 */

import { haversineKm } from "../../src/utils/haversine";
import {
  scoreRecommendationCandidate,
  type RecommendationCandidate,
  type RecommendationJobLocation,
} from "../../src/services/recommendationEngine";

/** The production weights, copied here as the reference point for sweeps. */
export const TRUE_WEIGHTS = {
  distance: 0.3212,
  responseRate: 0.3467,
  rating: 0.3321,
} as const;

export type Weights = { distance: number; responseRate: number; rating: number };

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, 1));
}

/** Min–max distance normalisation over the candidate pool (as the engine does). */
export function maxDistanceOver(
  candidates: RecommendationCandidate[],
  job: RecommendationJobLocation,
): number {
  if (candidates.length === 0) return 0;
  let max = 0;
  for (const c of candidates) {
    const d = haversineKm(job.location_lat, job.location_lng, c.current_lat, c.current_lng);
    if (d > max) max = d;
  }
  return max;
}

/** Parameterised score, identical in form to the engine at TRUE_WEIGHTS. */
export function scoreWith(
  candidate: RecommendationCandidate,
  job: RecommendationJobLocation,
  maxDistanceKm: number,
  weights: Weights,
): number {
  const distanceKm = haversineKm(
    job.location_lat,
    job.location_lng,
    candidate.current_lat,
    candidate.current_lng,
  );
  const distanceScore = maxDistanceKm === 0 ? 1 : Math.max(0, 1 - distanceKm / maxDistanceKm);
  const responseRate = clamp01(candidate.responseRate);
  const ratingScore = clamp01(Number(candidate.rating ?? 0) / 5);
  return (
    weights.distance * distanceScore +
    weights.responseRate * responseRate +
    weights.rating * ratingScore
  );
}

/** Renormalise a weight vector to sum to 1 (used after OAT perturbation/ablation). */
export function normalizeWeights(w: Weights): Weights {
  const sum = w.distance + w.responseRate + w.rating;
  if (sum === 0) return { distance: 1 / 3, responseRate: 1 / 3, rating: 1 / 3 };
  return { distance: w.distance / sum, responseRate: w.responseRate / sum, rating: w.rating / sum };
}

/**
 * Guard: the parameterised scorer must equal the production engine at the
 * true weights, for every candidate in a sample pool. Throws on drift.
 */
export function assertMatchesEngine(
  candidates: RecommendationCandidate[],
  job: RecommendationJobLocation,
): void {
  const maxDist = maxDistanceOver(candidates, job);
  for (const c of candidates) {
    const mine = scoreWith(c, job, maxDist, TRUE_WEIGHTS);
    const real = scoreRecommendationCandidate(c, job, maxDist).score;
    if (Math.abs(mine - real) > 1e-12) {
      throw new Error(
        `scoring.ts drift for ${c.id}: parameterised=${mine} vs engine=${real}. ` +
          `Update TRUE_WEIGHTS / scoreWith to match recommendationEngine.ts.`,
      );
    }
  }
}
