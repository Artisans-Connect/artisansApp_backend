import { Router, type Request, type Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { catchAsync } from "../utils/catchAsync";
import { paramId } from "../utils/routeParams";
import * as notificationsService from "../services/notificationsService";

const router = Router();

router.get(
  "/",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const limit = Number(req.query.limit ?? 50);
    const notifications = await notificationsService.listNotifications(req.user!.id, Number.isFinite(limit) ? limit : 50);
    res.status(200).json({ success: true, data: notifications });
  }),
);

router.patch(
  "/read-all",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const result = await notificationsService.markAllNotificationsRead(req.user!.id);
    res.status(200).json(result);
  }),
);

router.patch(
  "/:id/read",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const notification = await notificationsService.markNotificationRead(req.user!.id, paramId(req.params.id));
    res.status(200).json({ success: true, data: notification });
  }),
);

export default router;
