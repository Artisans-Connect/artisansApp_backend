import { supabaseAdmin } from "../config/supabase";

export async function logEvent(jobId: string, actorId: string | null, eventType: string, amount?: number, details?: any) {
  try {
    await supabaseAdmin.from("payment_audit_logs").insert({
      job_id: jobId,
      actor_id: actorId,
      event_type: eventType,
      amount: amount || null,
      details: details || {}
    });
  } catch (err: any) {
    console.error("Audit log error:", err.message);
  }
}
