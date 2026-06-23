import { haversineKm } from "../utils/haversine";

const DISTANCE_WEIGHT = 0.3212;
const RESPONSE_RATE_WEIGHT = 0.3467;
const RATING_WEIGHT = 0.3321;
const PREMIUM_TIE_DELTA = 0.02;
const NEW_ARTISAN_COMPLETED_JOBS_THRESHOLD = 5;

export type RecommendationJobLocation = {
  location_lat: number;
  location_lng: number;
};

export type RecommendationCandidate = {
  id: string;
  current_lat: number;
  current_lng: number;
  rating: number | null;
  total_jobs: number | null;
  is_verified: boolean;
  responseRate: number;
};

export type ScoredRecommendationCandidate = RecommendationCandidate & {
  distanceKm: number;
  distanceScore: number;
  ratingScore: number;
  score: number;
};

export function scoreRecommendationCandidate(
  candidate: RecommendationCandidate,
  job: RecommendationJobLocation,
  maxDistanceKm: number,
): ScoredRecommendationCandidate {
  const distanceKm = haversineKm(
    job.location_lat,
    job.location_lng,
    candidate.current_lat,
    candidate.current_lng,
  );
  const distanceScore = maxDistanceKm === 0 ? 1 : Math.max(0, 1 - distanceKm / maxDistanceKm);
  const responseRate = clamp01(candidate.responseRate);
  const ratingScore = clamp01(Number(candidate.rating ?? 0) / 5);
  const score =
    DISTANCE_WEIGHT * distanceScore +
    RESPONSE_RATE_WEIGHT * responseRate +
    RATING_WEIGHT * ratingScore;

  return {
    ...candidate,
    responseRate,
    distanceKm,
    distanceScore,
    ratingScore,
    score,
  };
}

export function rankRecommendationCandidates<T extends RecommendationCandidate>(
  candidates: T[],
  job: RecommendationJobLocation,
): Array<T & ScoredRecommendationCandidate> {
  const distances = candidates.map((candidate) =>
    haversineKm(job.location_lat, job.location_lng, candidate.current_lat, candidate.current_lng),
  );
  const maxDistanceKm = distances.length === 0 ? 0 : Math.max(...distances);

  return candidates
    .map((candidate) => scoreRecommendationCandidate(candidate, job, maxDistanceKm) as T & ScoredRecommendationCandidate)
    .sort(compareRecommendationCandidates);
}

export function applyFairnessSlot<T extends RecommendationCandidate>(ranked: T[], limit: number): T[] {
  if (limit <= 0) return [];
  const selected = ranked.slice(0, limit);
  if (selected.some(isNewArtisan)) return selected;

  const newArtisan = ranked.find(isNewArtisan);
  if (!newArtisan) return selected;
  if (selected.some((candidate) => candidate.id === newArtisan.id)) return selected;
  if (selected.length < limit) return [...selected, newArtisan];

  return [...selected.slice(0, limit - 1), newArtisan];
}

function compareRecommendationCandidates(
  a: ScoredRecommendationCandidate,
  b: ScoredRecommendationCandidate,
): number {
  const scoreDelta = b.score - a.score;
  if (Math.abs(scoreDelta) <= PREMIUM_TIE_DELTA && a.is_verified !== b.is_verified) {
    return Number(b.is_verified) - Number(a.is_verified);
  }
  if (scoreDelta !== 0) return scoreDelta;
  return Number(b.rating ?? 0) - Number(a.rating ?? 0);
}

function isNewArtisan(candidate: RecommendationCandidate): boolean {
  return Number(candidate.total_jobs ?? 0) < NEW_ARTISAN_COMPLETED_JOBS_THRESHOLD;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, 1));
}
