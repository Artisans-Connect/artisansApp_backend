import { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";
import { supabaseAdmin } from "../config/supabase";

export const authMiddleware = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return next(createHttpError(401, "Missing or invalid authorization header", { code: "UNAUTHORIZED" }));
    }

    const token = authHeader.slice(7).trim();
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      return next(createHttpError(401, "Invalid or expired token", { code: "UNAUTHORIZED" }));
    }

    req.user = {
      id: data.user.id,
      role: (data.user.user_metadata?.role as string | undefined) || null,
      email: data.user.email ?? null,
      phone: data.user.phone ?? null,
    };

    return next();
  } catch (error) {
    return next(error);
  }
};
