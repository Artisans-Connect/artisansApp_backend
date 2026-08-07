import { Router, type Request, type Response, type NextFunction } from "express";
import { authMiddleware } from "../middleware/auth";
import * as disputeService from "../services/disputeService";
import { appError } from "../utils/appError";

const router = Router();

router.post("/create", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId, reason, evidencePhotos } = req.body;
    if (!jobId || !reason) {
      next(appError(400, "jobId and reason are required", "VALIDATION_ERROR"));
      return;
    }

    const dispute = await disputeService.createDispute({
      userId: req.user!.id,
      jobId,
      reason,
      evidencePhotos,
    });

    res.status(201).json({ success: true, data: dispute });
  } catch (err) {
    next(err);
  }
});

router.get("/admin/list", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as string | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    const disputes = await disputeService.getDisputes(status, limit, offset);
    res.status(200).json({ success: true, data: disputes });
  } catch (err) {
    next(err);
  }
});

router.post("/admin/resolve", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { disputeId, resolutionType, clientAmount, workerAmount, notes } = req.body;
    if (!disputeId || !resolutionType) {
      next(appError(400, "disputeId and resolutionType are required", "VALIDATION_ERROR"));
      return;
    }

    const result = await disputeService.resolveDispute({
      adminId: req.user!.id,
      disputeId,
      resolutionType,
      clientAmount: clientAmount ? Number(clientAmount) : undefined,
      workerAmount: workerAmount ? Number(workerAmount) : undefined,
      notes,
    });

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
