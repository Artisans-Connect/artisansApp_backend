import assert from "node:assert/strict";
import {
  applyFairnessSlot,
  rankRecommendationCandidates,
  scoreRecommendationCandidate,
  type RecommendationCandidate,
} from "../src/services/recommendationEngine";

const job = { location_lat: 6.6885, location_lng: -1.6244 };

function candidate(
  id: string,
  patch: Partial<RecommendationCandidate> = {},
): RecommendationCandidate {
  return {
    id,
    current_lat: 6.6885,
    current_lng: -1.6244,
    rating: 0,
    total_jobs: 10,
    is_verified: false,
    responseRate: 0,
    ...patch,
  };
}

function ids(candidates: RecommendationCandidate[]): string[] {
  return candidates.map((item) => item.id);
}

{
  const scored = scoreRecommendationCandidate(
    candidate("w1", { rating: 5, responseRate: 1 }),
    job,
    1,
  );
  assert.equal(scored.score, 0.3212 + 0.3467 + 0.3321);
}

{
  const ranked = rankRecommendationCandidates(
    [
      candidate("near", { current_lat: 6.6885, current_lng: -1.6244 }),
      candidate("far", { current_lat: 6.7785, current_lng: -1.6244 }),
    ],
    job,
  );
  assert.deepEqual(ids(ranked), ["near", "far"]);
}

{
  const scored = scoreRecommendationCandidate(candidate("new"), job, 1);
  assert.equal(scored.responseRate, 0);
}

{
  const ranked = rankRecommendationCandidates(
    [
      candidate("regular", { rating: 5, responseRate: 1 }),
      candidate("verified", { rating: 5, responseRate: 1, is_verified: true }),
    ],
    job,
  );
  assert.deepEqual(ids(ranked), ["verified", "regular"]);
}

{
  const ranked = [
    candidate("established-1", { total_jobs: 30 }),
    candidate("established-2", { total_jobs: 20 }),
    candidate("established-3", { total_jobs: 15 }),
    candidate("new-artisan", { total_jobs: 0 }),
  ];
  const selected = applyFairnessSlot(ranked, 3);
  assert.deepEqual(ids(selected), ["established-1", "established-2", "new-artisan"]);
}
