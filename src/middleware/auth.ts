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
      .select("account_status, suspension_reason")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileError) {
      return next(appError(500, profileError.message, "PROFILE_FETCH_FAILED"));
    }

    if (profile?.account_status === "suspended") {
      return next(appError(
        403,
        profile.suspension_reason
          ? `Your account has been suspended. ${profile.suspension_reason}`
          : "Your account has been suspended. Please contact admin/support if you think this is a mistake.",
        "ACCOUNT_SUSPENDED",
      ));
    }

    return next();
  } catch (error) {
    return next(error);
  }
};
