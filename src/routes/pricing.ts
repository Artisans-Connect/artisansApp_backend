import { Router, type Request, type Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { catchAsync } from "../utils/catchAsync";
import * as pricingService from "../services/pricingService";
import { z } from "zod";
import { appError } from "../utils/appError";

const router = Router();

const estimateSchema = z.object({
  category_id: z.string().uuid(),
  location_lat: z.number().min(-90).max(90),
  location_lng: z.number().min(-180).max(180),
  job_mode: z.enum(["asap", "scheduled", "flexible"]),
});

router.post(
  "/estimate",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const parsed = estimateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw appError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid estimate payload",
        "VALIDATION_ERROR",
      );
    }

    const { category_id, location_lat, location_lng, job_mode } = parsed.data;

    const estimate = await pricingService.estimateFee(
      category_id,
      location_lat,
      location_lng,
      job_mode,
    );

    res.status(200).json({ success: true, data: estimate });
  }),
);

export default router;
