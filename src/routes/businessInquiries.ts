import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { catchAsync } from "../utils/catchAsync";
import { paramId } from "../utils/routeParams";
import { requirePortalAdmin } from "../middleware/admin";
import * as businessInquiriesService from "../services/businessInquiriesService";

const router = Router();

// Anti-abuse rate limiter for public enterprise inquiry form
const publicInquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many inquiries submitted from this connection. Please try again later.",
    code: "RATE_LIMIT_EXCEEDED",
  },
});

const maybeLimit = (req: Request, res: Response, next: () => void) => {
  if (process.env.NODE_ENV !== "production") return next();
  return publicInquiryLimiter(req, res, next);
};

/**
 * POST /api/business-inquiries
 * Public intake endpoint for CraftMatch for Business / Corporate inquiries
 */
router.post(
  "/",
  maybeLimit,
  catchAsync(async (req: Request, res: Response) => {
    const inquiry = await businessInquiriesService.createBusinessInquiry(req.body);
    res.status(201).json({
      success: true,
      message: "Your corporate inquiry has been registered. Our enterprise coordinator will reach out shortly.",
      data: inquiry,
    });
  }),
);

/**
 * GET /api/business-inquiries
 * Admin portal endpoint to view corporate inquiries
 */
router.get(
  "/",
  requirePortalAdmin,
  catchAsync(async (req: Request, res: Response) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const offset = typeof req.query.offset === "string" ? Number(req.query.offset) : undefined;

    const data = await businessInquiriesService.listBusinessInquiries({
      status,
      limit,
      offset,
    });

    res.status(200).json({ success: true, data });
  }),
);

/**
 * PATCH /api/business-inquiries/:id
 * Admin portal endpoint to update status/notes of an inquiry
 */
router.patch(
  "/:id",
  requirePortalAdmin,
  catchAsync(async (req: Request, res: Response) => {
    const updated = await businessInquiriesService.updateBusinessInquiry(
      paramId(req.params.id),
      req.body,
    );
    res.status(200).json({ success: true, data: updated });
  }),
);

export default router;
