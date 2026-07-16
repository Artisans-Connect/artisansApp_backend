import { Router, type Request, type Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { catchAsync } from "../utils/catchAsync";
import * as jobsService from "../services/jobsService";
import * as applicationsService from "../services/applicationsService";
import { paramId } from "../utils/routeParams";

const router = Router();

router.get(
  "/mine",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const statusParam = req.query.status as string | undefined;
    const statusFilter = statusParam ? statusParam.split(",") : undefined;
    const jobs = await jobsService.getMyJobs(req.user!.id, statusFilter);
    res.status(200).json({ success: true, data: jobs });
  }),
);

router.post(
  "/create",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const idempotencyKey = req.get("Idempotency-Key");
    const job = await jobsService.createJob(req.user!.id, req.body, idempotencyKey);
    res.status(201).json({ success: true, data: job });
  }),
);

router.get(
  "/:id/applications",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const applications = await applicationsService.listApplicationsForJob(
      req.user!.id,
      paramId(req.params.id),
    );
    res.status(200).json({ success: true, data: applications });
  }),
);

router.post(
  "/:id/applications/:applicationId/accept",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const job = await applicationsService.acceptApplication(
      req.user!.id,
      paramId(req.params.id),
      paramId(req.params.applicationId),
    );
    res.status(200).json({ success: true, data: job });
  }),
);

router.get(
  "/:id/matching-progress",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const progress = await jobsService.getMatchingProgress(req.user!.id, paramId(req.params.id));
    res.status(200).json({ success: true, data: progress });
  }),
);

router.get(
  "/:id/cancellation-preview",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const preview = await jobsService.getCancellationPreview(req.user!.id, paramId(req.params.id));
    res.status(200).json({ success: true, data: preview });
  }),
);

router.post(
  "/:id/cancel",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const job = await jobsService.cancelJob(req.user!.id, paramId(req.params.id), req.body ?? {});
    res.status(200).json({ success: true, data: job });
  }),
);

router.post(
  "/:id/request-termination",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const job = await jobsService.requestTermination(req.user!.id, paramId(req.params.id), req.body ?? {});
    res.status(200).json({ success: true, data: job });
  }),
);

router.post(
  "/:id/request-another-worker",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const job = await jobsService.requestAnotherWorker(req.user!.id, paramId(req.params.id));
    res.status(200).json({ success: true, data: job });
  }),
);

router.post(
  "/:id/confirm-work-done",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const job = await jobsService.confirmWorkDone(req.user!.id, paramId(req.params.id));
    res.status(200).json({ success: true, data: job });
  }),
);

router.post(
  "/:id/complete",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const job = await jobsService.completeJobWithDetails(req.user!.id, paramId(req.params.id), req.body ?? {});
    res.status(200).json({ success: true, data: job });
  }),
);

router.post(
  "/:id/approve-completion",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const job = await jobsService.approveCompletion(req.user!.id, paramId(req.params.id));
    res.status(200).json({ success: true, data: job });
  }),
);

router.post(
  "/:id/reopen",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const job = await jobsService.reopenJob(req.user!.id, paramId(req.params.id), req.body ?? {});
    res.status(200).json({ success: true, data: job });
  }),
);

router.get(
  "/:id",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const job = await jobsService.getJobById(req.user!.id, paramId(req.params.id));
    res.status(200).json({ success: true, data: job });
  }),
);

export default router;
