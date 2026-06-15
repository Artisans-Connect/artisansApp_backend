import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { appError } from "../utils/appError";

export function requirePortalAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    const configuredKey = env.VERIFICATION_ADMIN_KEY;
    if (!configuredKey && env.NODE_ENV !== "production") return next();

    const providedKey = req.get("x-verification-admin-key");
    if (!configuredKey || providedKey !== configuredKey) {
      throw appError(403, "Verification admin access required", "FORBIDDEN");
    }

    return next();
  } catch (error) {
    return next(error);
  }
}
