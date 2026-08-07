import { Router, type Request, type Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { catchAsync } from "../utils/catchAsync";
import { paramId } from "../utils/routeParams";
import * as reportsService from "../services/reportsService";

const router = Router();

router.use(authMiddleware);

router.post(
  "/",
  catchAsync(async (req: Request, res: Response) => {
    const reporterId = req.user!.id;
    const report = await reportsService.createReport(reporterId, req.body);
    res.status(201).json({ success: true, data: report });
  })
);

router.get(
  "/my",
  catchAsync(async (req: Request, res: Response) => {
    const reporterId = req.user!.id;
    const reports = await reportsService.getUserReports(reporterId);
    res.status(200).json({ success: true, data: reports });
  })
);

router.get(
  "/context/:bookingId",
  catchAsync(async (req: Request, res: Response) => {
    const bookingId = paramId(req.params.bookingId);
    const context = await reportsService.getBookingReportContext(bookingId);
    res.status(200).json({ success: true, data: context });
  })
);

// Block management
router.post(
  "/block",
  catchAsync(async (req: Request, res: Response) => {
    const blockerId = req.user!.id;
    const block = await reportsService.blockUser(blockerId, req.body);
    res.status(201).json({ success: true, data: block });
  })
);

router.delete(
  "/block/:blockedId",
  catchAsync(async (req: Request, res: Response) => {
    const blockerId = req.user!.id;
    const blockedId = paramId(req.params.blockedId);
    const result = await reportsService.unblockUser(blockerId, blockedId);
    res.status(200).json({ success: true, data: result });
  })
);

router.get(
  "/blocks",
  catchAsync(async (req: Request, res: Response) => {
    const blockerId = req.user!.id;
    const blocks = await reportsService.listUserBlocks(blockerId);
    res.status(200).json({ success: true, data: blocks });
  })
);

router.get(
  "/block-status/:targetUserId",
  catchAsync(async (req: Request, res: Response) => {
    const userId1 = req.user!.id;
    const userId2 = paramId(req.params.targetUserId);
    const status = await reportsService.checkBlockStatus(userId1, userId2);
    res.status(200).json({ success: true, data: status });
  })
);

export default router;
