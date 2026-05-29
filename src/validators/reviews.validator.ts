import { z } from "zod";

export const createReviewSchema = z.object({
  job_id: z.string().uuid(),
  worker_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});
