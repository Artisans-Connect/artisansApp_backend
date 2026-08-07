import { Router, type Request, type Response, type NextFunction } from "express";
import { authMiddleware } from "../middleware/auth";
import * as walletService from "../services/walletService";
import { appError } from "../utils/appError";

const router = Router();

router.get("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    const data = await walletService.getWalletTransactions(req.user!.id, limit, offset);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post("/topup", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { amount, reference } = req.body;
    if (!amount || Number(amount) <= 0 || !reference) {
      next(appError(400, "Valid amount and reference are required", "VALIDATION_ERROR"));
      return;
    }

    const updatedWallet = await walletService.creditWallet({
      userId: req.user!.id,
      amount: Number(amount),
      reference: reference as string,
      type: "deposit",
      description: `Manual Top-up via ${reference.startsWith("cm_pay_") ? "Sandbox" : "Paystack"}`,
    });

    res.status(200).json({ success: true, data: updatedWallet });
  } catch (err) {
    next(err);
  }
});

export default router;
