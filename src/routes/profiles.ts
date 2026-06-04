import { Router, type Request, type Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { catchAsync } from "../utils/catchAsync";
import * as profilesService from "../services/profilesService";

const router = Router();

router.post(
  "/",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const profile = await profilesService.createProfile(req.user!.id, req.body);
    res.status(201).json({ success: true, data: profile });
  }),
);

router.get(
  "/me",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const profile = await profilesService.getProfile(req.user!.id);
    res.status(200).json({ success: true, data: profile });
  }),
);

router.put(
  "/me",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const profile = await profilesService.updateProfile(req.user!.id, req.body);
    res.status(200).json({ success: true, data: profile });
  }),
);

router.patch(
  "/me/mode",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const profile = await profilesService.updateActiveMode(req.user!.id, req.body);
    res.status(200).json({ success: true, data: profile });
  }),
);

router.post(
  "/me/worker",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const profile = await profilesService.onboardWorker(req.user!.id, req.body);
    res.status(201).json({ success: true, data: profile });
  }),
);

router.put(
  "/me/fcm-token",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const result = await profilesService.updateFcmToken(req.user!.id, req.body);
    res.status(200).json(result);
  }),
);

export default router;
