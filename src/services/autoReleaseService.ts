import { supabaseAdmin } from "../config/supabase";
import { logger } from "../utils/logger";
import { JOB_STATUS } from "../constants/enums";
import * as walletService from "./walletService";

export async function processAutoReleases() {
  const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Find jobs pending approval or with work_ended_at older than 24 hours
  const { data: eligibleJobs, error } = await supabaseAdmin
    .from("jobs")
    .select("id, client_id, worker_id, title, work_ended_at, status")
    .in("status", [JOB_STATUS.PENDING_CLIENT_APPROVAL, JOB_STATUS.IN_PROGRESS])
    .not("work_ended_at", "is", null)
    .lte("work_ended_at", cutoffTime);

  if (error) {
    logger("AutoRelease fetch error:", error.message);
    return;
  }

  if (!eligibleJobs || eligibleJobs.length === 0) return;

  for (const job of eligibleJobs) {
    try {
      // Check if there are active disputes for this job
      const { data: disputes } = await supabaseAdmin
        .from("job_disputes")
        .select("id")
        .eq("job_id", job.id)
        .in("status", ["open", "under_review"]);

      if (disputes && disputes.length > 0) {
        logger(`Skipping auto-release for job ${job.id} due to active dispute.`);
        continue;
      }

      // Fetch escrow balance
      const { data: escrow } = await supabaseAdmin
        .from("job_escrow_balances")
        .select("*")
        .eq("job_id", job.id)
        .maybeSingle();

      if (!escrow || Number(escrow.held_amount) <= 0) continue;

      const payoutAmount = Number(escrow.held_amount);
      const reference = `auto_rel_${job.id.substring(0, 8)}_${Date.now()}`;

      // Credit worker wallet
      if (job.worker_id) {
        await walletService.creditWallet({
          userId: job.worker_id,
          amount: payoutAmount,
          reference,
          type: "escrow_release",
          jobId: job.id,
          description: `Auto-released 48h escrow for job: ${job.title}`,
        });
      }

      // Update escrow record
      await supabaseAdmin
        .from("job_escrow_balances")
        .update({
          held_amount: 0.00,
          released_amount: payoutAmount,
          status: "released",
          updated_at: new Date().toISOString(),
        })
        .eq("job_id", job.id);

      // Record ledger
      await supabaseAdmin.from("escrow_ledger").insert({
        job_id: job.id,
        amount: payoutAmount,
        type: "release",
        reference,
      });

      // Update job status to completed
      await supabaseAdmin
        .from("jobs")
        .update({
          status: JOB_STATUS.COMPLETED,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      logger(`Auto-released escrow of GHS ${payoutAmount} for job ${job.id} to worker ${job.worker_id}`);
    } catch (err: any) {
      logger(`Auto-release error for job ${job.id}:`, err.message);
    }
  }
}
