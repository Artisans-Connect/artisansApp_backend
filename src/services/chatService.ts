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
    .select("id, title, status, client_id, worker_id, updated_at")
    .or(`client_id.eq.${userId},worker_id.eq.${userId}`)
    .not("worker_id", "is", null)
    .order("updated_at", { ascending: false });

  if (error) throw appError(500, error.message, "CONVERSATIONS_FETCH_FAILED");
  return data ?? [];
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
