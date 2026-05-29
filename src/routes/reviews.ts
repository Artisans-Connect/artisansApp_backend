import { Router, type Request, type Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { catchAsync } from "../utils/catchAsync";
import * as reviewsService from "../services/reviewsService";
import { paramId } from "../utils/routeParams";

const router = Router();

router.post(
  "/",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const review = await reviewsService.createReview(req.user!.id, req.body);
    res.status(201).json({ success: true, data: review });
  }),
);

router.get(
  "/worker/:workerId",
  catchAsync(async (req: Request, res: Response) => {
    const reviews = await reviewsService.getWorkerReviews(paramId(req.params.workerId));
    res.status(200).json({ success: true, data: reviews });
  }),
);

export default router;
