/**
 * Latency benchmark for the production ranking function.
 *
 * Times `rankRecommendationCandidates` (the real engine, unmodified) over
 * candidate pools of increasing size, replacing the manuscript's previously
 * unbacked "142 ms for 5,000 workers" claim with a measured, reproducible
 * distribution (median / p95 / p99 / 95% CI).
 */

import { performance } from "node:perf_hooks";
import { rankRecommendationCandidates } from "../../src/services/recommendationEngine";
import { makeWorkers, makeJobs } from "./simDataset";
import { summarize, round, type Summary } from "./stats";

export type LatencyResult = {
  poolSize: number;
  reps: number;
  ms: Summary;
};

const SIZES = [100, 1_000, 5_000, 10_000];
const REPS = 40;
const WARMUP = 5;

export function runLatencyBench(seed: number): LatencyResult[] {
  const job = makeJobs(seed, 1)[0]!;
  const results: LatencyResult[] = [];

  for (const size of SIZES) {
    const pool = makeWorkers(seed + size, size);

    // Warm up JIT so timings reflect steady state, not first-call compilation.
    for (let i = 0; i < WARMUP; i++) rankRecommendationCandidates(pool, job);

    const samples: number[] = [];
    for (let i = 0; i < REPS; i++) {
      const t0 = performance.now();
      rankRecommendationCandidates(pool, job);
      samples.push(performance.now() - t0);
    }

    results.push({ poolSize: size, reps: REPS, ms: summarize(samples) });
  }

  return results;
}

export function formatLatency(results: LatencyResult[]): string {
  const lines = [
    "| Pool size | Median (ms) | Mean (ms) | p95 (ms) | p99 (ms) | 95% CI (±ms) |",
    "|---|---|---|---|---|---|",
  ];
  for (const r of results) {
    lines.push(
      `| ${r.poolSize.toLocaleString()} | ${round(r.ms.median, 3)} | ${round(r.ms.mean, 3)} | ` +
        `${round(r.ms.p95, 3)} | ${round(r.ms.p99, 3)} | ${round(r.ms.ci95, 3)} |`,
    );
  }
  return lines.join("\n");
}
