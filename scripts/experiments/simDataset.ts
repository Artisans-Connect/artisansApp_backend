/**
 * Deterministic synthetic data for the dispatch experiments.
 *
 * Workers and jobs are drawn over a bounding box roughly covering Greater
 * Kumasi, Ghana — the same reference point (6.6885, -1.6244) used by the
 * engine's existing correctness test. Everything is seeded, so datasets are
 * reproducible across runs and machines.
 */

import { mulberry32, uniform, normal, chance, randInt, type Rng } from "./prng";
import type { RecommendationCandidate, RecommendationJobLocation } from "../../src/services/recommendationEngine";

// Approx. bounding box for Greater Kumasi.
export const KUMASI = {
  latMin: 6.60,
  latMax: 6.78,
  lngMin: -1.72,
  lngMax: -1.54,
} as const;

export type SimWorker = RecommendationCandidate & {
  /** Ground-truth probability the worker responds/accepts when dispatched. */
  trueAcceptProb: number;
  /** Whether the worker's last location ping is fresh (passes the filter). */
  isFresh: boolean;
};

export type SimJob = RecommendationJobLocation & { id: string };

/**
 * Build a worker population. `responseRate` is the platform's *observed*
 * reliability estimate; `trueAcceptProb` is the latent behaviour the
 * simulation samples acceptance from — correlated with, but not equal to,
 * the observed rate (models estimation noise).
 */
export function makeWorkers(seed: number, count: number): SimWorker[] {
  const rng: Rng = mulberry32(seed);
  const workers: SimWorker[] = [];
  for (let i = 0; i < count; i++) {
    const responseRate = Math.max(0, Math.min(1, normal(rng, 0.72, 0.18, 0, 1)));
    // Latent acceptance tracks the observed rate with noise.
    const trueAcceptProb = Math.max(0.02, Math.min(0.99, responseRate + normal(rng, 0, 0.1)));
    workers.push({
      id: `w${i}`,
      current_lat: uniform(rng, KUMASI.latMin, KUMASI.latMax),
      current_lng: uniform(rng, KUMASI.lngMin, KUMASI.lngMax),
      rating: Number(normal(rng, 4.1, 0.6, 0, 5).toFixed(2)),
      total_jobs: randInt(rng, 0, 120),
      is_verified: chance(rng, 0.55),
      responseRate: Number(responseRate.toFixed(3)),
      trueAcceptProb,
      isFresh: chance(rng, 0.8), // ~20% stale — excluded by the freshness filter
    });
  }
  return workers;
}

/** Build a stream of job requests over the same geography. */
export function makeJobs(seed: number, count: number): SimJob[] {
  const rng: Rng = mulberry32(seed);
  const jobs: SimJob[] = [];
  for (let i = 0; i < count; i++) {
    jobs.push({
      id: `j${i}`,
      location_lat: uniform(rng, KUMASI.latMin, KUMASI.latMax),
      location_lng: uniform(rng, KUMASI.lngMin, KUMASI.lngMax),
    });
  }
  return jobs;
}

/** Independent snapshot of a worker pool (per-simulation reset). */
export function resetWorkers(workers: SimWorker[]): SimWorker[] {
  return workers.map((w) => ({ ...w }));
}
