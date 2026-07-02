/**
 * Dispatch simulation: graded baseline ladder on identical demand streams.
 *
 * Replaces the manuscript's strawman "first-come broadcast" comparison and its
 * circular proximity+rating "satisfaction" metric. Three policies are run on
 * the *same* seeded worker pool and job stream:
 *
 *   random   — pick available in-radius workers at random (lower bound)
 *   nearest  — greedy pure-proximity ranking (the naive baseline)
 *   full     — the real 3-factor engine + fairness slot (deployed model)
 *
 * Metrics are behavioural and non-circular:
 *   matchRate        — fraction of jobs matched within MAX_ROUNDS
 *   meanRounds       — rounds-to-accept for matched jobs (wait-time proxy)
 *   dispatchPerMatch — push notifications sent per successful match
 *   meanMatchKm      — realised travel distance of the matched worker
 *   utilGini         — Gini of jobs-per-worker (fairness of load spread)
 *
 * Contention is real: an accepting worker is busy for SERVICE_JOBS subsequent
 * arrivals, so policies genuinely compete for a finite supply.
 */

import { MATCHING } from "../../src/constants/enums";
import { haversineKm } from "../../src/utils/haversine";
import {
  rankRecommendationCandidates,
  applyFairnessSlot,
} from "../../src/services/recommendationEngine";
import { mulberry32, shuffle, chance, type Rng } from "./prng";
import { makeWorkers, makeJobs, resetWorkers, type SimWorker, type SimJob } from "./simDataset";
import { maximizeAssignment } from "./hungarian";
import { mean, gini, summarize, round, type Summary } from "./stats";

const RADIUS = MATCHING.RADIUS_STEPS_KM;
const MAX_ROUNDS = MATCHING.MAX_ROUNDS; // 3
const PER_ROUND = MATCHING.WORKERS_PER_ROUND; // 3

export type Policy = "random" | "nearest" | "full";
export const POLICIES: Policy[] = ["random", "nearest", "full"];

type RunMetrics = {
  matchRate: number;
  meanRounds: number;
  dispatchPerMatch: number;
  meanMatchKm: number;
  utilGini: number;
};

export type PolicySummary = {
  policy: Policy;
  matchRate: Summary;
  meanRounds: Summary;
  dispatchPerMatch: Summary;
  meanMatchKm: Summary;
  utilGini: Summary;
};

/** Rank an in-radius candidate pool under a given policy, return the top cohort. */
function selectCohort(
  policy: Policy,
  pool: SimWorker[],
  job: SimJob,
  rng: Rng,
): SimWorker[] {
  if (policy === "random") {
    return shuffle(rng, [...pool]).slice(0, PER_ROUND);
  }
  if (policy === "nearest") {
    return [...pool]
      .sort(
        (a, b) =>
          haversineKm(job.location_lat, job.location_lng, a.current_lat, a.current_lng) -
          haversineKm(job.location_lat, job.location_lng, b.current_lat, b.current_lng),
      )
      .slice(0, PER_ROUND);
  }
  // full: real engine ranking + fairness slot
  const ranked = rankRecommendationCandidates(pool, job);
  return applyFairnessSlot(ranked, PER_ROUND);
}

/** One simulation over the whole job stream for one policy. */
function simulateOnce(
  workers: SimWorker[],
  jobs: SimJob[],
  policy: Policy,
  seed: number,
  serviceJobs: number,
): RunMetrics {
  const pool = resetWorkers(workers);
  const rng = mulberry32(seed);
  const freeAt = new Map<string, number>(); // worker id -> job index when it frees
  // Track assignments by id, not on the object: the "full" policy ranks via the
  // engine, which returns *copies* of candidates — mutating them would be lost.
  const assigned = new Map<string, number>();

  let matched = 0;
  let dispatches = 0;
  const roundsToAccept: number[] = [];
  const matchKm: number[] = [];

  jobs.forEach((job, jobIdx) => {
    let done = false;
    for (let round = 0; round < MAX_ROUNDS && !done; round++) {
      const radius = RADIUS[Math.min(round, RADIUS.length - 1)]!;
      const available = pool.filter(
        (w) =>
          w.isFresh &&
          (freeAt.get(w.id) ?? -1) <= jobIdx &&
          haversineKm(job.location_lat, job.location_lng, w.current_lat, w.current_lng) <= radius,
      );
      if (available.length === 0) continue;

      const cohort = selectCohort(policy, available, job, rng);
      for (const w of cohort) {
        dispatches++;
        if (chance(rng, w.trueAcceptProb)) {
          matched++;
          assigned.set(w.id, (assigned.get(w.id) ?? 0) + 1);
          freeAt.set(w.id, jobIdx + serviceJobs);
          roundsToAccept.push(round + 1);
          matchKm.push(
            haversineKm(job.location_lat, job.location_lng, w.current_lat, w.current_lng),
          );
          done = true;
          break;
        }
      }
    }
  });

  return {
    matchRate: matched / jobs.length,
    meanRounds: roundsToAccept.length ? mean(roundsToAccept) : 0,
    dispatchPerMatch: matched ? dispatches / matched : 0,
    meanMatchKm: matchKm.length ? mean(matchKm) : 0,
    utilGini: gini(pool.map((w) => assigned.get(w.id) ?? 0)),
  };
}

/** Run every policy across `reps` seeds and summarise with CIs. */
export function runSimLadder(
  baseSeed: number,
  workerCount: number,
  jobCount: number,
  reps: number,
  serviceJobs: number,
): PolicySummary[] {
  const perPolicy: Record<Policy, RunMetrics[]> = { random: [], nearest: [], full: [] };

  for (let r = 0; r < reps; r++) {
    const workers = makeWorkers(baseSeed + r * 101, workerCount);
    const jobs = makeJobs(baseSeed + r * 211 + 7, jobCount);
    for (const policy of POLICIES) {
      // Same worker pool + job stream per rep; acceptance rng seeded per rep (shared
      // across policies so differences come from dispatch decisions, not luck).
      perPolicy[policy].push(simulateOnce(workers, jobs, policy, baseSeed + r * 17 + 1, serviceJobs));
    }
  }

  return POLICIES.map((policy) => {
    const runs = perPolicy[policy];
    return {
      policy,
      matchRate: summarize(runs.map((m) => m.matchRate)),
      meanRounds: summarize(runs.map((m) => m.meanRounds)),
      dispatchPerMatch: summarize(runs.map((m) => m.dispatchPerMatch)),
      meanMatchKm: summarize(runs.map((m) => m.meanMatchKm)),
      utilGini: summarize(runs.map((m) => m.utilGini)),
    };
  });
}

/**
 * Greedy-vs-optimal batch matching gap.
 *
 * For each batch of open jobs + available workers, compare the total ranking
 * score achieved by greedy per-job assignment (what the platform does) against
 * the Hungarian optimum. Reports the mean relative gap — how much a global
 * batch matcher would improve total match quality.
 */
export function runHungarianGap(baseSeed: number, batches: number, jobsPerBatch: number, workersPerBatch: number): Summary {
  const gaps: number[] = [];

  for (let b = 0; b < batches; b++) {
    const workers = makeWorkers(baseSeed + b * 53, workersPerBatch).filter((w) => w.isFresh);
    const jobs = makeJobs(baseSeed + b * 97 + 3, jobsPerBatch);
    if (workers.length === 0) continue;

    // Score matrix: job i x worker j, distance normalised per job's pool.
    const scores: number[][] = jobs.map((job) => {
      const dists = workers.map((w) =>
        haversineKm(job.location_lat, job.location_lng, w.current_lat, w.current_lng),
      );
      const maxD = Math.max(...dists, 0);
      return workers.map((w, j) => {
        const distScore = maxD === 0 ? 1 : Math.max(0, 1 - dists[j]! / maxD);
        const resp = Math.max(0, Math.min(1, w.responseRate));
        const rate = Math.max(0, Math.min(1, Number(w.rating ?? 0) / 5));
        return 0.3212 * distScore + 0.3467 * resp + 0.3321 * rate;
      });
    });

    // Greedy: each job takes its best still-available worker, in order.
    const taken = new Set<number>();
    let greedy = 0;
    for (let i = 0; i < jobs.length; i++) {
      let bestJ = -1;
      let bestS = -Infinity;
      for (let j = 0; j < workers.length; j++) {
        if (!taken.has(j) && scores[i]![j]! > bestS) {
          bestS = scores[i]![j]!;
          bestJ = j;
        }
      }
      if (bestJ >= 0) {
        taken.add(bestJ);
        greedy += bestS;
      }
    }

    const { total: optimal } = maximizeAssignment(scores);
    if (optimal > 0) gaps.push((optimal - greedy) / optimal);
  }

  return summarize(gaps);
}

export function formatSimLadder(summaries: PolicySummary[]): string {
  const lines = [
    "| Policy | Match rate | Mean rounds | Dispatches/match | Mean match dist (km) | Util. Gini |",
    "|---|---|---|---|---|---|",
  ];
  for (const s of summaries) {
    lines.push(
      `| ${s.policy} | ${round(s.matchRate.mean * 100, 1)}% ±${round(s.matchRate.ci95 * 100, 1)} | ` +
        `${round(s.meanRounds.mean, 2)} | ${round(s.dispatchPerMatch.mean, 2)} | ` +
        `${round(s.meanMatchKm.mean, 2)} | ${round(s.utilGini.mean, 3)} |`,
    );
  }
  return lines.join("\n");
}
