import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";
import { sendMessageSchema } from "../validators/chat.validator";
import * as notifyService from "./notifyService";

async function assertJobParticipant(userId: string, jobId: string) {
  const { data: job } = await supabaseAdmin
    .from("jobs")
    .select("id, client_id, worker_id")
    .eq("id", jobId)
    .maybeSingle();

  if (!job) throw appError(404, "Conversation not found", "CONVERSATION_NOT_FOUND");
  if (job.client_id !== userId && job.worker_id !== userId) {
    throw appError(403, "Not allowed to access this conversation", "FORBIDDEN");
  }
  return job;
}

export async function listConversations(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("jobs")
    .select(
      "id, title, status, client_id, worker_id, updated_at, client:profiles!jobs_client_id_fkey(full_name, avatar_url), worker:profiles!jobs_worker_id_fkey(full_name, avatar_url)",
    )
    .or(`client_id.eq.${userId},worker_id.eq.${userId}`)
    .not("worker_id", "is", null)
    .order("updated_at", { ascending: false });

  if (error) throw appError(500, error.message, "CONVERSATIONS_FETCH_FAILED");

  const jobs = data ?? [];
  if (jobs.length === 0) return [];

  const jobIds = jobs.map((j) => j.id);
  const { data: latestMessages } = await supabaseAdmin
    .from("messages")
    .select("job_id, content, created_at")
    .in("job_id", jobIds)
    .order("created_at", { ascending: false });

  const lastByJob = new Map<string, { content: string; created_at: string }>();
  for (const msg of latestMessages ?? []) {
    if (!lastByJob.has(msg.job_id)) {
      lastByJob.set(msg.job_id, { content: msg.content, created_at: msg.created_at });
    }
  }

  return jobs.map((job) => {
    const isClient = job.client_id === userId;
    const counterpart = isClient ? job.worker : job.client;
    const counterpartProfile = counterpart as { full_name?: string; avatar_url?: string } | null;
    const last = lastByJob.get(job.id);

    return {
      id: job.id,
      title: job.title,
      status: job.status,
      client_id: job.client_id,
      worker_id: job.worker_id,
      updated_at: job.updated_at,
      counterpart_id: isClient ? job.worker_id : job.client_id,
      counterpart_name: counterpartProfile?.full_name ?? "User",
      counterpart_avatar_url: counterpartProfile?.avatar_url ?? null,
      last_message_preview: last?.content ?? job.title,
      last_message_at: last?.created_at ?? job.updated_at,
    };
  });
}

export async function getMessages(userId: string, jobId: string) {
  await assertJobParticipant(userId, jobId);

  const { data, error } = await supabaseAdmin
    .from("messages")
    .select("id, job_id, sender_id, content, image_urls, is_read, created_at")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (error) throw appError(500, error.message, "MESSAGES_FETCH_FAILED");
  return data ?? [];
}

export async function sendMessage(userId: string, jobId: string, body: unknown) {
  const parsed = sendMessageSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid message payload", "VALIDATION_ERROR");
  }

  const job = await assertJobParticipant(userId, jobId);

  const { data, error } = await supabaseAdmin
    .from("messages")
    .insert({
      job_id: jobId,
      sender_id: userId,
      content: parsed.data.content,
      image_urls: parsed.data.image_urls,
    })
    .select()
    .single();

  if (error) throw appError(500, error.message, "MESSAGE_SEND_FAILED");

  const recipientId = job.client_id === userId ? job.worker_id : job.client_id;
  if (recipientId) {
    await notifyService.notifyChatMessage(recipientId, jobId, parsed.data.content.slice(0, 120));
  }

  return data;
}
