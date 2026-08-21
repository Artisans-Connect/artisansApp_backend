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

// Worker submits a client review
router.post(
  "/client",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const review = await reviewsService.createClientReview(req.user!.id, req.body);
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

// Get reviews about a specific client
router.get(
  "/client/:clientId",
  catchAsync(async (req: Request, res: Response) => {
    const reviews = await reviewsService.getClientReviews(paramId(req.params.clientId));
    res.status(200).json({ success: true, data: reviews });
  }),
);

// Check if worker has already reviewed client for a job
router.get(
  "/check/:jobId",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const result = await reviewsService.hasWorkerReviewedJob(req.user!.id, paramId(req.params.jobId));
    res.status(200).json({ success: true, data: result });
  }),
);

export default router;
