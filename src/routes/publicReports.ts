import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { catchAsync } from "../utils/catchAsync";
import * as reportsService from "../services/reportsService";

const router = Router();

// Anti-abuse: the public "Report Abuse" form is unauthenticated, so cap
// submissions per IP well below the global limiter to stop the moderation queue
// being flooded. No-op outside production (mirrors middleware/rateLimiter) so
// local dev and the test suite aren't throttled.
const publicReportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many reports submitted from this device. Please try again later.",
    code: "RATE_LIMIT_EXCEEDED",
  },
});

const maybeLimit = (req: Request, res: Response, next: () => void) => {
  if (process.env.NODE_ENV !== "production") return next();
  return publicReportLimiter(req, res, next);
};

// POST /api/public/reports — anonymous abuse report intake (Support Hub web form)
router.post(
  "/",
  maybeLimit,
  catchAsync(async (req: Request, res: Response) => {
    const result = await reportsService.createPublicReport(req.body);
    res.status(201).json({ success: true, data: result });
  }),
);

export default router;
