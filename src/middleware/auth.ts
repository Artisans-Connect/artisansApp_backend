import { NextFunction, Request, Response } from "express";
import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";

export const authMiddleware = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return next(appError(401, "Missing or invalid authorization header", "UNAUTHORIZED"));
    }

    const token = authHeader.slice(7).trim();
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      return next(appError(401, "Invalid or expired token", "UNAUTHORIZED"));
    }

    req.user = {
      id: data.user.id,
      role: (data.user.user_metadata?.role as string | undefined) || null,
      email: data.user.email ?? null,
      phone: data.user.phone ?? null,
    };

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("account_status, suspension_reason, suspended_until")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileError) {
      return next(appError(500, profileError.message, "PROFILE_FETCH_FAILED"));
    }

    if (profile?.account_status === "suspended") {
      // Temporary suspensions carry an expiry (suspended_until). Once it passes we
      // lift the suspension on the user's next request ("lift on read") — this app
      // has no scheduler, and the auth middleware is the single enforcement point,
      // so this is where an expired temporary suspension naturally clears.
      const expiresAt = profile.suspended_until ? Date.parse(profile.suspended_until) : NaN;
      const isExpiredTemporary = Number.isFinite(expiresAt) && expiresAt <= Date.now();

      if (!isExpiredTemporary) {
        return next(appError(
          403,
          profile.suspension_reason
            ? `Your account has been suspended. ${profile.suspension_reason}`
            : "Your account has been suspended. Please contact admin/support if you think this is a mistake.",
          "ACCOUNT_SUSPENDED",
        ));
      }

      // Expired temporary suspension: clear it. Filtering the update on the still
      // -suspended status makes it idempotent, so concurrent requests can't send
      // duplicate "suspension lifted" notifications.
      const { data: lifted } = await supabaseAdmin
        .from("profiles")
        .update({
          account_status: "active",
          suspended_at: null,
          suspended_until: null,
          suspension_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.user.id)
        .eq("account_status", "suspended")
        .select("id")
        .maybeSingle();

      if (lifted) {
        try {
          await supabaseAdmin.from("notifications").insert({
            user_id: data.user.id,
            title: "✅ Suspension Lifted",
            body: "Your temporary suspension has ended and your CraftMatch account is active again. Please keep to our community guidelines.",
            data: { type: "SUSPENSION_LIFTED" },
          });
        } catch (_) {}
      }
    }

    return next();
  } catch (error) {
    return next(error);
  }
};
