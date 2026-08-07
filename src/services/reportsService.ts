import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";
import { createReportSchema, updateReportModerationSchema, blockUserSchema } from "../validators/reportsValidator";

function generateTicketNumber(): string {
  const year = new Date().getFullYear();
  const randomStr = Math.floor(100000 + Math.random() * 900000).toString();
  return `REP-${year}-${randomStr}`;
}

export async function createReport(reporterId: string, body: unknown) {
  const parsed = createReportSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid report payload", "VALIDATION_ERROR");
  }

  const payload = parsed.data;

  // Prevent self-reporting
  if (payload.reported_id && payload.reported_id === reporterId) {
    throw appError(400, "You cannot report yourself.", "INVALID_REPORT_TARGET");
  }

  // 1. Gather Contextual Metadata automatically
  const contextMetadata: Record<string, unknown> = {
    submission_timestamp: new Date().toISOString(),
    client_extra: payload.client_metadata ?? null,
  };

  if (payload.booking_id) {
    const { data: job } = await supabaseAdmin
      .from("jobs")
      .select("id, title, status, client_id, worker_id, created_at, scheduled_time, latitude, longitude, address, payment_status, total_amount")
      .eq("id", payload.booking_id)
      .maybeSingle();

    if (job) {
      contextMetadata.booking_snapshot = {
        job_id: job.id,
        title: job.title,
        status: job.status,
        client_id: job.client_id,
        worker_id: job.worker_id,
        scheduled_time: job.scheduled_time,
        address: job.address,
        latitude: job.latitude,
        longitude: job.longitude,
        payment_status: job.payment_status,
        total_amount: job.total_amount,
        created_at: job.created_at,
      };

      // Auto-set reported_id if not explicitly provided
      if (!payload.reported_id) {
        payload.reported_id = reporterId === job.client_id ? job.worker_id : job.client_id;
      }
    }
  }

  if (payload.reported_id) {
    const { data: reportedUser } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, last_active_mode, account_status")
      .eq("id", payload.reported_id)
      .maybeSingle();

    if (reportedUser) {
      contextMetadata.reported_user_snapshot = {
        id: reportedUser.id,
        full_name: reportedUser.full_name,
        role: reportedUser.last_active_mode,
        account_status: reportedUser.account_status,
      };
    }
  }

  // Determine priority
  let priority = payload.is_emergency ? "URGENT" : "MEDIUM";
  if (!payload.is_emergency) {
    if (["SAFETY_CONCERN", "VIOLENCE_THREAT", "HARASSMENT"].includes(payload.category)) {
      priority = "HIGH";
    } else if (["POOR_WORKMANSHIP", "UNPROFESSIONAL_BEHAVIOR"].includes(payload.category)) {
      priority = "LOW";
    }
  }

  const ticketNumber = generateTicketNumber();

  // Insert report
  const { data: report, error } = await supabaseAdmin
    .from("reports")
    .insert({
      ticket_number: ticketNumber,
      reporter_id: reporterId,
      reported_id: payload.reported_id ?? null,
      booking_id: payload.booking_id ?? null,
      chat_id: payload.chat_id ?? null,
      category: payload.category,
      description: payload.description,
      attachments: payload.attachments ?? [],
      priority,
      status: "PENDING",
      is_emergency: payload.is_emergency ?? false,
      context_metadata: contextMetadata,
    })
    .select("*")
    .single();

  if (error || !report) {
    throw appError(500, error?.message ?? "Failed to submit safety report", "REPORT_CREATION_FAILED");
  }

  // Create initial audit log entry
  await supabaseAdmin.from("report_audit_logs").insert({
    report_id: report.id,
    actor_id: reporterId,
    actor_role: "reporter",
    action: payload.is_emergency ? "EMERGENCY_REPORT_SUBMITTED" : "REPORT_SUBMITTED",
    new_status: "PENDING",
    notes: `Report ${ticketNumber} created under category ${payload.category}${payload.is_emergency ? " (EMERGENCY FLAGGED)" : ""}`,
  });

  // Emergency automation flag: notify admins or temporarily mark account for review if emergency
  if (payload.is_emergency && payload.reported_id) {
    await supabaseAdmin.from("report_audit_logs").insert({
      report_id: report.id,
      actor_id: null,
      actor_role: "system",
      action: "EMERGENCY_ACCOUNT_FLAGGED",
      notes: `Reported account ${payload.reported_id} flagged for urgent moderator review due to emergency report.`,
    });
  }

  // Send confirmation notification to reporter
  try {
    await supabaseAdmin.from("notifications").insert({
      user_id: reporterId,
      title: payload.is_emergency ? "Emergency Report Received" : "Report Received",
      body: `Your Trust & Safety report (${ticketNumber}) has been received. Our moderation team is reviewing it urgently.`,
      data: { report_id: report.id, ticket_number: ticketNumber, is_emergency: payload.is_emergency },
    });
  } catch (_) {}

  return report;
}

export async function getUserReports(reporterId: string) {
  const { data, error } = await supabaseAdmin
    .from("reports")
    .select("id, ticket_number, category, description, priority, status, is_emergency, action_taken, resolution_reason, created_at, updated_at, resolved_at")
    .eq("reporter_id", reporterId)
    .order("created_at", { ascending: false });

  if (error) {
    throw appError(500, error.message, "REPORTS_FETCH_FAILED");
  }

  return data ?? [];
}

export async function getBookingReportContext(bookingId: string) {
  const { data: job, error } = await supabaseAdmin
    .from("jobs")
    .select("id, title, status, client_id, worker_id, created_at, scheduled_time, address, client:profiles!jobs_client_id_fkey(full_name, avatar_url), worker:profiles!jobs_worker_id_fkey(full_name, avatar_url)")
    .eq("id", bookingId)
    .maybeSingle();

  if (error) throw appError(500, error.message, "BOOKING_CONTEXT_FETCH_FAILED");
  if (!job) throw appError(404, "Booking not found", "BOOKING_NOT_FOUND");

  return job;
}

// User Block management
export async function blockUser(blockerId: string, body: unknown) {
  const parsed = blockUserSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid block request", "VALIDATION_ERROR");
  }

  const { blocked_id, reason } = parsed.data;
  if (blockerId === blocked_id) {
    throw appError(400, "You cannot block yourself", "INVALID_BLOCK");
  }

  const { data, error } = await supabaseAdmin
    .from("user_blocks")
    .upsert({
      blocker_id: blockerId,
      blocked_id,
      reason: reason ?? null,
    }, { onConflict: "blocker_id,blocked_id" })
    .select("id, blocker_id, blocked_id, reason, created_at")
    .single();

  if (error) throw appError(500, error.message, "BLOCK_FAILED");
  return data;
}

export async function unblockUser(blockerId: string, blockedId: string) {
  const { error } = await supabaseAdmin
    .from("user_blocks")
    .delete()
    .eq("blocker_id", blockerId)
    .eq("blocked_id", blockedId);

  if (error) throw appError(500, error.message, "UNBLOCK_FAILED");
  return { success: true, message: "User unblocked successfully" };
}

export async function listUserBlocks(blockerId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_blocks")
    .select("id, blocked_id, reason, created_at, blocked:profiles!user_blocks_blocked_id_fkey(id, full_name, avatar_url)")
    .eq("blocker_id", blockerId)
    .order("created_at", { ascending: false });

  if (error) throw appError(500, error.message, "BLOCKS_FETCH_FAILED");
  return data ?? [];
}

export async function checkBlockStatus(userId1: string, userId2: string) {
  const { data } = await supabaseAdmin
    .from("user_blocks")
    .select("blocker_id, blocked_id")
    .or(`and(blocker_id.eq.${userId1},blocked_id.eq.${userId2}),and(blocker_id.eq.${userId2},blocked_id.eq.${userId1})`);

  const isBlockedByMe = data?.some((b) => b.blocker_id === userId1 && b.blocked_id === userId2) ?? false;
  const isBlockedByThem = data?.some((b) => b.blocker_id === userId2 && b.blocked_id === userId1) ?? false;

  return { is_blocked: isBlockedByMe || isBlockedByThem, is_blocked_by_me: isBlockedByMe, is_blocked_by_them: isBlockedByThem };
}

// ADMIN MODERATION SERVICES

export async function listAdminReports(query: {
  status?: string;
  priority?: string;
  category?: string;
  is_emergency?: string;
  q?: string;
}) {
  let request = supabaseAdmin
    .from("reports")
    .select("id, ticket_number, category, description, priority, status, is_emergency, action_taken, reporter_id, reported_id, booking_id, assigned_moderator_id, created_at, updated_at, reporter:profiles!reports_reporter_id_fkey(id, full_name, phone), reported:profiles!reports_reported_id_fkey(id, full_name, phone, account_status)")
    .order("is_emergency", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (query.status) {
    request = request.eq("status", query.status);
  }
  if (query.priority) {
    request = request.eq("priority", query.priority);
  }
  if (query.category) {
    request = request.eq("category", query.category);
  }
  if (query.is_emergency === "true") {
    request = request.eq("is_emergency", true);
  }
  if (query.q?.trim()) {
    const term = query.q.trim();
    request = request.or(`ticket_number.ilike.%${term}%,category.ilike.%${term}%,description.ilike.%${term}%`);
  }

  const { data, error } = await request;
  if (error) throw appError(500, error.message, "ADMIN_REPORTS_FETCH_FAILED");
  return data ?? [];
}

export async function getAdminReportDetail(reportId: string) {
  const { data: report, error } = await supabaseAdmin
    .from("reports")
    .select("*, reporter:profiles!reports_reporter_id_fkey(id, full_name, phone, avatar_url, created_at), reported:profiles!reports_reported_id_fkey(id, full_name, phone, avatar_url, account_status, created_at, workers(id, is_verified, rating, total_jobs)), booking:jobs!reports_booking_id_fkey(*)")
    .eq("id", reportId)
    .maybeSingle();

  if (error) throw appError(500, error.message, "ADMIN_REPORT_DETAIL_FETCH_FAILED");
  if (!report) throw appError(404, "Report not found", "REPORT_NOT_FOUND");

  // Fetch Audit Logs
  const { data: auditLogs } = await supabaseAdmin
    .from("report_audit_logs")
    .select("id, actor_id, actor_role, action, previous_status, new_status, notes, created_at, actor:profiles(full_name)")
    .eq("report_id", reportId)
    .order("created_at", { ascending: true });

  // Calculate Repeat Offender Risk Signals for Reported User
  let repeatOffenderRisk = null;
  if (report.reported_id) {
    repeatOffenderRisk = await calculateRepeatOffenderRisk(report.reported_id, report.reporter_id);
  }

  return {
    ...report,
    audit_logs: auditLogs ?? [],
    repeat_offender_risk: repeatOffenderRisk,
  };
}

export async function calculateRepeatOffenderRisk(reportedUserId: string, reporterId?: string) {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: reportsAgainst }, { data: reportsFiledByReporter }] = await Promise.all([
    supabaseAdmin
      .from("reports")
      .select("id, category, status, action_taken, is_emergency, created_at")
      .eq("reported_id", reportedUserId),
    reporterId
      ? supabaseAdmin
          .from("reports")
          .select("id, status, action_taken")
          .eq("reporter_id", reporterId)
      : { data: [] },
  ]);

  const totalReportsAgainst = reportsAgainst?.length ?? 0;
  const recentReportsAgainst = reportsAgainst?.filter((r) => r.created_at >= ninetyDaysAgo).length ?? 0;
  const confirmedViolations = reportsAgainst?.filter((r) => ["WARNING_ISSUED", "TEMPORARY_SUSPENSION", "PERMANENT_BAN"].includes(r.action_taken)).length ?? 0;
  const emergencyReportsCount = reportsAgainst?.filter((r) => r.is_emergency).length ?? 0;

  // Check false reporter ratio
  const totalFiledByReporter = reportsFiledByReporter?.length ?? 0;
  const dismissedFiledByReporter = reportsFiledByReporter?.filter((r) => r.status === "DISMISSED" || r.action_taken === "DISMISSED").length ?? 0;
  const falseReporterRatio = totalFiledByReporter > 2 ? dismissedFiledByReporter / totalFiledByReporter : 0;

  let riskLevel: "LOW" | "MODERATE" | "HIGH" | "CRITICAL" = "LOW";
  const riskFlags: string[] = [];

  if (confirmedViolations >= 2 || totalReportsAgainst >= 5 || emergencyReportsCount >= 2) {
    riskLevel = "CRITICAL";
    riskFlags.push("REPEAT_OFFENDER", "HIGH_VIOLATION_HISTORY");
  } else if (confirmedViolations >= 1 || recentReportsAgainst >= 2 || emergencyReportsCount >= 1) {
    riskLevel = "HIGH";
    riskFlags.push("MULTIPLE_RECENT_REPORTS");
  } else if (totalReportsAgainst >= 2) {
    riskLevel = "MODERATE";
    riskFlags.push("PRIOR_REPORTS_EXIST");
  }

  if (falseReporterRatio > 0.6) {
    riskFlags.push("SUSPECTED_FALSE_REPORTER");
  }

  return {
    reported_user_id: reportedUserId,
    total_reports_against: totalReportsAgainst,
    recent_reports_90d: recentReportsAgainst,
    confirmed_violations: confirmedViolations,
    emergency_reports_count: emergencyReportsCount,
    reporter_false_report_ratio: falseReporterRatio,
    risk_level: riskLevel,
    risk_flags: riskFlags,
    requires_manual_moderator_review: riskFlags.length > 0,
  };
}

export async function updateReportModeration(reportId: string, moderatorId: string, body: unknown) {
  const parsed = updateReportModerationSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid moderation update", "VALIDATION_ERROR");
  }

  const { data: existingReport } = await supabaseAdmin
    .from("reports")
    .select("*")
    .eq("id", reportId)
    .single();

  if (!existingReport) {
    throw appError(404, "Report not found", "REPORT_NOT_FOUND");
  }

  const updateData = parsed.data;
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    updated_at: now,
  };

  if (updateData.status) updates.status = updateData.status;
  if (updateData.priority) updates.priority = updateData.priority;
  if (updateData.action_taken) updates.action_taken = updateData.action_taken;
  if (updateData.assigned_moderator_id !== undefined) updates.assigned_moderator_id = updateData.assigned_moderator_id;
  if (updateData.moderation_notes) updates.moderation_notes = updateData.moderation_notes;
  if (updateData.resolution_reason) updates.resolution_reason = updateData.resolution_reason;

  if (updateData.status === "RESOLVED" || updateData.status === "DISMISSED" || updateData.status === "ACTION_TAKEN") {
    updates.resolved_at = now;
  }

  const { data: updatedReport, error } = await supabaseAdmin
    .from("reports")
    .update(updates)
    .eq("id", reportId)
    .select("*")
    .single();

  if (error || !updatedReport) {
    throw appError(500, error?.message ?? "Failed to update report moderation", "MODERATION_UPDATE_FAILED");
  }

  // Create Audit Log
  await supabaseAdmin.from("report_audit_logs").insert({
    report_id: reportId,
    actor_id: moderatorId,
    actor_role: "moderator",
    action: `MODERATION_ACTION_${updateData.action_taken || "UPDATED"}`,
    previous_status: existingReport.status,
    new_status: updatedReport.status,
    notes: updateData.moderation_notes || updateData.resolution_reason || `Updated status to ${updatedReport.status}`,
  });

  // Handle Account Enforcement Actions
  if (existingReport.reported_id && updateData.action_taken) {
    if (updateData.action_taken === "TEMPORARY_SUSPENSION" || updateData.action_taken === "PERMANENT_BAN") {
      const reason = updateData.resolution_reason || `Account ${updateData.action_taken} following Trust & Safety investigation (${existingReport.ticket_number})`;
      await supabaseAdmin
        .from("profiles")
        .update({
          account_status: "suspended",
          suspended_at: now,
          suspension_reason: reason,
          updated_at: now,
        })
        .eq("id", existingReport.reported_id);

      await supabaseAdmin
        .from("workers")
        .update({ is_available: false, updated_at: now })
        .eq("id", existingReport.reported_id);
    }
  }

  // Secure Notifications: Notify reporter of update/resolution (never showing reported identity details)
  if (existingReport.reporter_id) {
    const statusMsg = updateData.status === "RESOLVED" || updateData.status === "ACTION_TAKEN"
      ? `Your report (${existingReport.ticket_number}) has been investigated and resolved by our Trust & Safety team. Thank you for helping keep CraftMatch safe.`
      : updateData.status === "NEEDS_EVIDENCE"
      ? `Our team requires additional information regarding your report (${existingReport.ticket_number}). Please check support.`
      : `Your report (${existingReport.ticket_number}) status has been updated to ${updatedReport.status}.`;

    try {
      await supabaseAdmin.from("notifications").insert({
        user_id: existingReport.reporter_id,
        title: "Trust & Safety Update",
        body: statusMsg,
        data: { report_id: reportId, ticket_number: existingReport.ticket_number, status: updatedReport.status },
      });
    } catch (_) {}
  }

  return updatedReport;
}
