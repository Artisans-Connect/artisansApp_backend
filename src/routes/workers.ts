import { Router, type Request, type Response } from "express";
import { authMiddleware } from "../middleware/auth";

const router = Router();

// Protected worker profile and location updates
router.put("/location", authMiddleware, (req: Request, res: Response) => {
  res.status(200).json({ success: true, message: "Stub: Worker location update endpoint" });
});

router.put("/availability", authMiddleware, (req: Request, res: Response) => {
  res.status(200).json({ success: true, message: "Stub: Worker availability toggle endpoint" });
});

router.get("/nearby", authMiddleware, (req: Request, res: Response) => {
  res.status(200).json({ success: true, message: "Stub: Nearby workers retrieval endpoint" });
});

// Atomic acceptance actions
router.post("/accept/:jobId", authMiddleware, (req: Request, res: Response) => {
  res.status(200).json({ success: true, message: "Stub: Worker job acceptance endpoint" });
});

router.post("/decline/:jobId", authMiddleware, (req: Request, res: Response) => {
  res.status(200).json({ success: true, message: "Stub: Worker job declination endpoint" });
});

export default router;
