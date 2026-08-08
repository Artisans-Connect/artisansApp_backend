import { Router, type Request, type Response, type NextFunction } from "express";
import { authMiddleware } from "../middleware/auth";
import * as payoutService from "../services/payoutService";
import { appError } from "../utils/appError";

const router = Router();

router.post("/request", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, channel, accountNumber, accountName, bankCode } = req.body;
    if (!amount || !channel || !accountNumber || !accountName) {
      next(appError(400, "amount, channel, accountNumber, and accountName are required", "VALIDATION_ERROR"));
      return;
    }

    const payout = await payoutService.requestPayout({
      workerId: req.user!.id,
      amount: Number(amount),
      channel: channel as 'momo' | 'bank',
      accountNumber: String(accountNumber),
      accountName: String(accountName),
      bankCode: bankCode ? String(bankCode) : "MTN",
    });

    res.status(200).json({ success: true, data: payout });
  } catch (err) {
    next(err);
  }
});

router.get("/history", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    const history = await payoutService.getPayoutHistory(req.user!.id, limit, offset);
    res.status(200).json({ success: true, data: history });
  } catch (err) {
    next(err);
  }
});

export default router;
