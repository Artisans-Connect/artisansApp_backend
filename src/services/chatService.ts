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

async function assertDirectParticipant(userId: string, conversationId: string) {
  const { data: conversation } = await supabaseAdmin
    .from("direct_conversations")
    .select("id, client_id, worker_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conversation) return null;
  if (conversation.client_id !== userId && conversation.worker_id !== userId) {
    throw appError(403, "Not allowed to access this conversation", "FORBIDDEN");
  }
  return conversation;
}

async function assertConversationParticipant(userId: string, id: string) {
  const direct = await assertDirectParticipant(userId, id);
  if (direct) return { type: "direct" as const, conversation: direct };
  const job = await assertJobParticipant(userId, id);
  return { type: "job" as const, conversation: job };
}

export async function createDirectConversation(userId: string, body: unknown) {
  const workerId = (body as { worker_id?: string })?.worker_id;
  if (!workerId) throw appError(400, "worker_id is required", "VALIDATION_ERROR");
  if (workerId === userId) throw appError(400, "You cannot message yourself", "SELF_CONVERSATION");

  const { data: worker } = await supabaseAdmin
    .from("workers")
    .select("id")
    .eq("id", workerId)
    .maybeSingle();
  if (!worker) throw appError(404, "Worker not found", "WORKER_NOT_FOUND");

  // Prevent duplicates by checking first (in case unique constraint is missing)
  const { data: existingList } = await supabaseAdmin
    .from("direct_conversations")
    .select(
      "id, client_id, worker_id, updated_at, worker:profiles!direct_conversations_worker_id_fkey(full_name, avatar_url)",
    )
    .eq("client_id", userId)
    .eq("worker_id", workerId)
    .limit(1);

  if (existingList && existingList.length > 0) {
    return existingList[0];
  }

  const { data, error } = await supabaseAdmin
    .from("direct_conversations")
    .insert({
      client_id: userId,
      worker_id: workerId,
      updated_at: new Date().toISOString(),
    })
    .select(
      "id, client_id, worker_id, updated_at, worker:profiles!direct_conversations_worker_id_fkey(full_name, avatar_url)",
    )
    .single();

  if (error) throw appError(500, error.message, "DIRECT_CONVERSATION_FAILED");
  return data;
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

  const jobIds = jobs.map((j) => j.id);
  const { data: latestMessages } = jobIds.length === 0
    ? { data: [] }
    : await supabaseAdmin
        .from("messages")
        .select("job_id, content, image_urls, media_urls, created_at")
        .in("job_id", jobIds)
        .order("created_at", { ascending: false });

  const lastByJob = new Map<string, { content: string; created_at: string }>();
  for (const msg of latestMessages ?? []) {
    if (!lastByJob.has(msg.job_id)) {
      lastByJob.set(msg.job_id, {
        content: previewContent(msg),
        created_at: msg.created_at,
      });
    }
  }

  const jobConversations = jobs.map((job) => {
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
      type: "job",
    };
  });

  const { data: directConversations, error: directError } = await supabaseAdmin
    .from("direct_conversations")
    .select(
      "id, client_id, worker_id, updated_at, client:profiles!direct_conversations_client_id_fkey(full_name, avatar_url), worker:profiles!direct_conversations_worker_id_fkey(full_name, avatar_url)",
    )
    .or(`client_id.eq.${userId},worker_id.eq.${userId}`)
    .order("updated_at", { ascending: false });

  if (directError) throw appError(500, directError.message, "DIRECT_CONVERSATIONS_FETCH_FAILED");

  const directIds = (directConversations ?? []).map((c) => c.id);
  const { data: latestDirectMessages } = directIds.length === 0
    ? { data: [] }
    : await supabaseAdmin
        .from("messages")
        .select("conversation_id, content, image_urls, media_urls, created_at")
        .in("conversation_id", directIds)
        .order("created_at", { ascending: false });

  const lastByConversation = new Map<string, { content: string; created_at: string }>();
  for (const msg of latestDirectMessages ?? []) {
    if (msg.conversation_id && !lastByConversation.has(msg.conversation_id)) {
      lastByConversation.set(msg.conversation_id, {
        content: previewContent(msg),
        created_at: msg.created_at,
      });
    }
  }

  const direct = (directConversations ?? []).map((conversation) => {
    const isClient = conversation.client_id === userId;
    const counterpart = isClient ? conversation.worker : conversation.client;
    const profile = counterpart as { full_name?: string; avatar_url?: string } | null;
    const last = lastByConversation.get(conversation.id);
    return {
      id: conversation.id,
      title: "Enquiry",
      status: "direct",
      client_id: conversation.client_id,
      worker_id: conversation.worker_id,
      updated_at: conversation.updated_at,
      counterpart_id: isClient ? conversation.worker_id : conversation.client_id,
      counterpart_name: profile?.full_name ?? "User",
      counterpart_avatar_url: profile?.avatar_url ?? null,
      last_message_preview: last?.content ?? "Start an enquiry",
      last_message_at: last?.created_at ?? conversation.updated_at,
      type: "direct",
    };
  });

  // Deduplicate direct conversations by counterpart_id
  const uniqueDirect = new Map<string, typeof direct[0]>();
  for (const c of direct) {
    if (!uniqueDirect.has(c.counterpart_id)) {
      uniqueDirect.set(c.counterpart_id, c);
    } else {
      const existing = uniqueDirect.get(c.counterpart_id)!;
      if (new Date(c.last_message_at).getTime() > new Date(existing.last_message_at).getTime()) {
        uniqueDirect.set(c.counterpart_id, c);
      }
    }
  }

  // Also deduplicate jobs by counterpart_id? 
  // We'll leave jobs as-is, but if a job chat and a direct chat exist, we might want to keep both,
  // or group by counterpart overall. Let's group EVERYTHING by counterpart_id to ensure a clean UI.
  // In most chat apps, there's only 1 conversation tile per user. 
  // Tapping it opens the latest thread (job or direct).
  const allConversations = [...jobConversations, ...Array.from(uniqueDirect.values())];
  const uniqueConversations = new Map<string, typeof allConversations[0]>();
  for (const c of allConversations) {
    if (!uniqueConversations.has(c.counterpart_id)) {
      uniqueConversations.set(c.counterpart_id, c);
    } else {
      const existing = uniqueConversations.get(c.counterpart_id)!;
      if (new Date(c.last_message_at).getTime() > new Date(existing.last_message_at).getTime()) {
        uniqueConversations.set(c.counterpart_id, c);
      }
    }
  }

  // Query unread messages for this user
  const { data: unreadMsgs } = await supabaseAdmin
    .from("messages")
    .select("job_id, conversation_id")
    .neq("sender_id", userId)
    .eq("is_read", false);

  const unreadMap = new Map<string, number>();
  for (const m of unreadMsgs ?? []) {
    const key = m.job_id || m.conversation_id;
    if (key) {
      unreadMap.set(key, (unreadMap.get(key) ?? 0) + 1);
    }
  }

  const result = Array.from(uniqueConversations.values()).map((c) => ({
    ...c,
    unread_count: unreadMap.get(c.id) ?? 0,
  }));

  return result.sort(
    (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime(),
  );
}

function previewContent(msg: { content?: string | null; image_urls?: string[] | null; media_urls?: string[] | null }) {
  if (msg.content?.trim()) return msg.content;
  if ((msg.media_urls?.length ?? 0) > 0 || (msg.image_urls?.length ?? 0) > 0) {
    return "Media";
  }
  return "";
}

export async function getMessages(userId: string, conversationId: string) {
  const conversation = await assertConversationParticipant(userId, conversationId);

  let query = supabaseAdmin
    .from("messages")
    .select("id, job_id, conversation_id, sender_id, content, image_urls, media_urls, media_types, client_message_id, is_read, created_at");
  query = conversation.type === "direct"
    ? query.eq("conversation_id", conversationId)
    : query.eq("job_id", conversationId);

  const { data, error } = await query.order("created_at", { ascending: true });

  if (error) throw appError(500, error.message, "MESSAGES_FETCH_FAILED");
  return data ?? [];
}

export async function sendMessage(userId: string, conversationId: string, body: unknown) {
  const parsed = sendMessageSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid message payload", "VALIDATION_ERROR");
  }

  const conversation = await assertConversationParticipant(userId, conversationId);
  if (parsed.data.client_message_id) {
    let existingQuery = supabaseAdmin
      .from("messages")
      .select("id, job_id, conversation_id, sender_id, content, image_urls, media_urls, media_types, client_message_id, is_read, created_at")
      .eq("sender_id", userId)
      .eq("client_message_id", parsed.data.client_message_id);
    existingQuery = conversation.type === "direct"
      ? existingQuery.eq("conversation_id", conversationId)
      : existingQuery.eq("job_id", conversationId);

    const { data: existing, error: existingError } = await existingQuery.maybeSingle();
    if (existingError) throw appError(500, existingError.message, "MESSAGE_FETCH_FAILED");
    if (existing) return existing;
  }

  const { data, error } = await supabaseAdmin
    .from("messages")
    .insert({
      job_id: conversation.type === "job" ? conversationId : null,
      conversation_id: conversation.type === "direct" ? conversationId : null,
      sender_id: userId,
      content: parsed.data.content,
      image_urls: parsed.data.image_urls,
      media_urls: parsed.data.media_urls,
      media_types: parsed.data.media_types,
      client_message_id: parsed.data.client_message_id ?? null,
    })
    .select()
    .single();

  if (error) throw appError(500, error.message, "MESSAGE_SEND_FAILED");

  if (conversation.type === "direct") {
    await supabaseAdmin
      .from("direct_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);
  }

  const target = conversation.conversation;
  const recipientId = target.client_id === userId ? target.worker_id : target.client_id;
  if (recipientId) {
    await notifyService.notifyChatMessage(userId, recipientId, conversationId);
  }

  return data;
}
