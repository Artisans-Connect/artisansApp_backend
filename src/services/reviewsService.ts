import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";
import { createReviewSchema, createClientReviewSchema } from "../validators/reviews.validator";
import { approveCompletion } from "./jobsService";

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
    await approveCompletion(userId, input.job_id);
  }

  const { data, error } = await supabaseAdmin
    .from("reviews")
    .insert({
      job_id: input.job_id,
      reviewer_id: userId,
      worker_id: input.worker_id,
      rating: input.rating,
      comment: input.comment ?? null,
      review_type: 'client_to_worker'
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

export async function createClientReview(userId: string, body: unknown) {
  const parsed = createClientReviewSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid review", "VALIDATION_ERROR");
  }

  const input = parsed.data;

  const { data: job } = await supabaseAdmin
    .from("jobs")
    .select("id, client_id, worker_id, status")
    .eq("id", input.job_id)
    .maybeSingle();

  if (!job) throw appError(404, "Job not found", "JOB_NOT_FOUND");
  if (job.status !== "completed" && job.status !== "pending_client_approval") {
    throw appError(400, "Can only review completed or pending jobs", "JOB_NOT_COMPLETED");
  }
  if (job.worker_id !== userId) throw appError(403, "Only the assigned worker can review the client", "FORBIDDEN");

  const { data, error } = await supabaseAdmin
    .from("reviews")
    .insert({
      job_id: input.job_id,
      reviewer_id: userId,
      worker_id: job.client_id, // Reusing worker_id for target
      rating: input.rating,
      comment: input.comment ?? null,
      review_type: 'worker_to_client'
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      throw appError(409, "You have already reviewed this client for this job", "REVIEW_EXISTS");
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

export async function getClientReviews(clientId: string) {
  // We join jobs to find the client's jobs
  // The reviewer is the worker, so we need reviewer's profile
  const { data, error } = await supabaseAdmin
    .from("reviews")
    .select("id, rating, comment, created_at, profiles!reviews_reviewer_id_fkey(full_name, avatar_url), jobs!inner(client_id)")
    .eq("review_type", "worker_to_client")
    .eq("jobs.client_id", clientId)
    .order("created_at", { ascending: false });

  if (error) throw appError(500, error.message, "REVIEWS_FETCH_FAILED");
  
  // map out the jobs wrapper for cleaner response
  return data ? data.map(d => ({
    id: d.id,
    rating: d.rating,
    comment: d.comment,
    created_at: d.created_at,
    profiles: d.profiles
  })) : [];
}

export async function hasWorkerReviewedJob(workerId: string, jobId: string) {
  const { count, error } = await supabaseAdmin
    .from("reviews")
    .select("*", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("reviewer_id", workerId)
    .eq("review_type", "worker_to_client");

  if (error) throw appError(500, error.message, "REVIEW_CHECK_FAILED");
  return { reviewed: (count ?? 0) > 0 };
}
