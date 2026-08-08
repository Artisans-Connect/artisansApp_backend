import { RecommendationCandidate } from "../recommendationEngine";

export type WorkerRow = {
  id: string;
  current_lat: number | null;
  current_lng: number | null;
  location_at: string | null;
  rating: number | null;
  total_jobs: number | null;
  skills: string[] | null;
  is_available: boolean;
  is_verified: boolean;
};

export type DispatchState = {
  round: number;
  radiusIndex: number;
  timeout?: NodeJS.Timeout;
};

export type WorkerRecommendationCandidate = WorkerRow &
  RecommendationCandidate & {
    current_lat: number;
    current_lng: number;
  };

export type DispatchStatsRow = {
  worker_id: string;
  status: string | null;
};

export const RESPONSIVE_DISPATCH_STATUSES = new Set<string>(["accepted", "declined", "seen"]);
