import { Router, type Request, type Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { catchAsync } from "../utils/catchAsync";
import * as workersService from "../services/workersService";
import { paramId } from "../utils/routeParams";

const router = Router();

router.put(
  "/location",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const worker = await workersService.updateLocation(req.user!.id, req.body);
    res.status(200).json({ success: true, data: worker });
  }),
);

router.put(
  "/availability",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const worker = await workersService.updateAvailability(req.user!.id, req.body);
    res.status(200).json({ success: true, data: worker });
  }),
);

router.get(
  "/nearby",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const workers = await workersService.getNearby(req.query);
    res.status(200).json({ success: true, data: workers });
  }),
);

router.post(
  "/accept/:jobId",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const job = await workersService.acceptJob(req.user!.id, paramId(req.params.jobId));
    res.status(200).json({ success: true, data: job });
  }),
);

router.post(
  "/decline/:jobId",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const result = await workersService.declineJob(req.user!.id, paramId(req.params.jobId));
    res.status(200).json(result);
  }),
);

router.put(
  "/me/profile",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const worker = await workersService.updateWorkerProfile(req.user!.id, req.body);
    res.status(200).json({ success: true, data: worker });
  }),
);

router.get(
  "/me/active-job",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const job = await workersService.getActiveJob(req.user!.id);
    res.status(200).json({ success: true, data: job });
  }),
);

router.get(
  "/me/job-requests",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const jobs = await workersService.getJobRequests(req.user!.id);
    res.status(200).json({ success: true, data: jobs });
  }),
);

router.get(
  "/me/job-requests/:jobId",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const job = await workersService.getJobRequestById(req.user!.id, paramId(req.params.jobId));
    res.status(200).json({ success: true, data: job });
  }),
);

router.get(
  "/me/history",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const jobs = await workersService.getHistory(req.user!.id);
    res.status(200).json({ success: true, data: jobs });
  }),
);

router.put(
  "/me/demo-verify",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const worker = await workersService.verifyMeForDemo(req.user!.id);
    res.status(200).json({ success: true, data: worker });
  }),
);

router.post(
  "/:jobId/on-way",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const job = await workersService.markOnTheWay(req.user!.id, paramId(req.params.jobId));
    res.status(200).json({ success: true, data: job });
  }),
);

router.post(
  "/:jobId/arrive",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const job = await workersService.markArrived(req.user!.id, paramId(req.params.jobId));
    res.status(200).json({ success: true, data: job });
  }),
);

router.post(
  "/:jobId/start",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const job = await workersService.startJob(req.user!.id, paramId(req.params.jobId));
    res.status(200).json({ success: true, data: job });
  }),
);

export default router;
