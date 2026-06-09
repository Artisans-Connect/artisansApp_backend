import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";
import { createReviewSchema } from "../validators/reviews.validator";

export async function createReview(userId: string, body: unknown) {
  const parsed = createReviewSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid review", "VALIDATION_ERROR");
  }

  const input = parsed.data;

  // Verify: job exists, is ready for client approval, and user is the client
  const { data: job } = await supabaseAdmin
    .from("jobs")
    .select("id, client_id, worker_id, status")
    .eq("id", input.job_id)
    .maybeSingle();

  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");
  if (job.status !== "completed" && job.status !== "pending_client_approval") {
    throw appError(400, "Can only review jobs awaiting approval or completed jobs", "JOB_NOT_COMPLETED");
  }
  if (job.client_id !== userId) throw appError(403, "Only the client can review", "FORBIDDEN");
  if (job.worker_id !== input.worker_id) throw appError(400, "Worker ID does not match the job", "WORKER_MISMATCH");

  if (job.status === "pending_client_approval") {
    const { error: jobError } = await supabaseAdmin
      .from("jobs")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", input.job_id);
    if (jobError) throw appError(500, jobError.message, "JOB_APPROVE_COMPLETION_FAILED");
  }

  const { data, error } = await supabaseAdmin
    .from("reviews")
    .insert({
      job_id: input.job_id,
      reviewer_id: userId,
      worker_id: input.worker_id,
      rating: input.rating,
      comment: input.comment ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      throw appError(409, "You have already reviewed this job", "REVIEW_EXISTS");
    }
    throw appError(500, error.message, "REVIEW_CREATE_FAILED");
  }

  return data;
}

export async function getWorkerReviews(workerId: string) {
  const { data, error } = await supabaseAdmin
    .from("reviews")
    .select("id, rating, comment, created_at, profiles!reviews_reviewer_id_fkey(full_name, avatar_url)")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false });

  if (error) throw appError(500, error.message, "REVIEWS_FETCH_FAILED");
  return data ?? [];
}
