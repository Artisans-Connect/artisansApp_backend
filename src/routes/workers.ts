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

export default router;
