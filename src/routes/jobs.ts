import { Router, type Request, type Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { catchAsync } from "../utils/catchAsync";
import * as jobsService from "../services/jobsService";
import { paramId } from "../utils/routeParams";

const router = Router();

router.post(
  "/create",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const job = await jobsService.createJob(req.user!.id, req.body);
    res.status(201).json({ success: true, data: job });
  }),
);

router.post(
  "/:id/cancel",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const job = await jobsService.cancelJob(req.user!.id, paramId(req.params.id));
    res.status(200).json({ success: true, data: job });
  }),
);

router.post(
  "/:id/complete",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const job = await jobsService.completeJob(req.user!.id, paramId(req.params.id));
    res.status(200).json({ success: true, data: job });
  }),
);

export default router;
