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
    const limit = Number(req.query.limit ?? 20);
    const offset = Number(req.query.offset ?? 0);
    const notifications = await notificationsService.listNotifications(
      req.user!.id,
      Number.isFinite(limit) ? limit : 20,
      Number.isFinite(offset) ? offset : 0
    );
    res.status(200).json({ success: true, data: notifications });
  }),
);

router.get(
  "/unread-count",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const result = await notificationsService.getUnreadNotificationCount(req.user!.id);
    res.status(200).json({ success: true, data: result });
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

router.delete(
  "/:id",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    await notificationsService.deleteNotification(req.user!.id, paramId(req.params.id));
    res.status(200).json({ success: true });
  }),
);

export default router;
