/**
 * Weight sensitivity analysis and per-component ablations.
 *
 * The manuscript presents its weights as fixed without justification. This
 * quantifies how much the ranking output actually depends on them:
 *
 *   OAT      — one-at-a-time ±20% perturbation of each weight (renormalised),
 *              measuring rank churn vs the true-weight ranking.
 *   Monte    — random weight vectors, reporting the spread of top-1 agreement.
 *   Ablation — drop each factor entirely (weight 0, renormalise) and measure
 *              how far the ranking moves — i.e. how load-bearing each signal is.
 *
 * "Rank churn" = fraction of the top-K cohort that changes vs the baseline
 * ranking. Low churn under ±20% ⇒ the exact weights are not fragile.
 */

import { mulberry32, type Rng } from "./prng";
import { makeWorkers, makeJobs, type SimWorker, type SimJob } from "./simDataset";
import {
  scoreWith,
  maxDistanceOver,
  normalizeWeights,
  TRUE_WEIGHTS,
  type Weights,
} from "./scoring";
import { mean, round } from "./stats";

const TOP_K = 3; // matches WORKERS_PER_ROUND

function rankIdsByWeights(pool: SimWorker[], job: SimJob, weights: Weights): string[] {
  const maxD = maxDistanceOver(pool, job);
  return [...pool]
    .map((w) => ({ id: w.id, s: scoreWith(w, job, maxD, weights) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.id);
}

/** Fraction of the baseline top-K that is displaced under `weights`. */
function topKChurn(pool: SimWorker[], job: SimJob, baseTop: string[], weights: Weights): number {
  const top = new Set(rankIdsByWeights(pool, job, weights).slice(0, TOP_K));
  const kept = baseTop.filter((id) => top.has(id)).length;
  return (baseTop.length - kept) / baseTop.length;
}

export type SensitivityResult = {
  oat: { factor: keyof Weights; direction: string; meanChurn: number }[];
  ablation: { factor: keyof Weights; meanChurn: number }[];
  monteCarloMeanChurn: number;
  scenarios: number;
};

export function runWeightSensitivity(seed: number, scenarios: number, poolSize: number): SensitivityResult {
  const jobs = makeJobs(seed, scenarios);
  const pools = jobs.map((_, i) => makeWorkers(seed + 1000 + i, poolSize));
  const baseTops = pools.map((pool, i) => rankIdsByWeights(pool, jobs[i]!, TRUE_WEIGHTS).slice(0, TOP_K));

  const factors: (keyof Weights)[] = ["distance", "responseRate", "rating"];

  // --- OAT ±20% ---
  const oat: SensitivityResult["oat"] = [];
  for (const factor of factors) {
    for (const [dir, mult] of [["-20%", 0.8], ["+20%", 1.2]] as const) {
      const churns: number[] = [];
      for (let i = 0; i < scenarios; i++) {
        const w = normalizeWeights({ ...TRUE_WEIGHTS, [factor]: TRUE_WEIGHTS[factor] * mult });
        churns.push(topKChurn(pools[i]!, jobs[i]!, baseTops[i]!, w));
      }
      oat.push({ factor, direction: dir, meanChurn: mean(churns) });
    }
  }

  // --- Ablations (drop one factor) ---
  const ablation: SensitivityResult["ablation"] = [];
  for (const factor of factors) {
    const churns: number[] = [];
    for (let i = 0; i < scenarios; i++) {
      const w = normalizeWeights({ ...TRUE_WEIGHTS, [factor]: 0 });
      churns.push(topKChurn(pools[i]!, jobs[i]!, baseTops[i]!, w));
    }
    ablation.push({ factor, meanChurn: mean(churns) });
  }

  // --- Monte Carlo random weight vectors ---
  const rng: Rng = mulberry32(seed + 99);
  const mcChurns: number[] = [];
  const draws = 200;
  for (let d = 0; d < draws; d++) {
    const raw = { distance: rng(), responseRate: rng(), rating: rng() };
    const w = normalizeWeights(raw);
    for (let i = 0; i < scenarios; i++) {
      mcChurns.push(topKChurn(pools[i]!, jobs[i]!, baseTops[i]!, w));
    }
  }

  return {
    oat,
    ablation,
    monteCarloMeanChurn: mean(mcChurns),
    scenarios,
  };
}

export function formatSensitivity(r: SensitivityResult): string {
  const lines: string[] = [];
  lines.push(`**OAT ±20% perturbation** (mean top-${TOP_K} churn vs true weights, over ${r.scenarios} scenarios):`);
  lines.push("");
  lines.push("| Factor | −20% | +20% |");
  lines.push("|---|---|---|");
  const byFactor = new Map<string, { m: string; p: string }>();
  for (const o of r.oat) {
    const e = byFactor.get(o.factor) ?? { m: "", p: "" };
    if (o.direction === "-20%") e.m = `${round(o.meanChurn * 100, 1)}%`;
    else e.p = `${round(o.meanChurn * 100, 1)}%`;
    byFactor.set(o.factor, e);
  }
  for (const [factor, e] of byFactor) lines.push(`| ${factor} | ${e.m} | ${e.p} |`);
  lines.push("");
  lines.push(`**Ablation** (drop factor entirely, mean top-${TOP_K} churn):`);
  lines.push("");
  lines.push("| Dropped factor | Top-K churn |");
  lines.push("|---|---|");
  for (const a of r.ablation) lines.push(`| ${a.factor} | ${round(a.meanChurn * 100, 1)}% |`);
  lines.push("");
  lines.push(`**Monte-Carlo** (200 random weight vectors): mean top-${TOP_K} churn = **${round(r.monteCarloMeanChurn * 100, 1)}%**.`);
  return lines.join("\n");
}
