import { Router, type Request, type Response } from "express";
import { authMiddleware } from "../middleware/auth";

const router = Router();

// Protected chat and conversation list endpoints
router.get("/", authMiddleware, (req: Request, res: Response) => {
  res.status(200).json({ success: true, message: "Stub: Conversations list endpoint" });
});

router.get("/:id/messages", authMiddleware, (req: Request, res: Response) => {
  res.status(200).json({ success: true, message: "Stub: Conversation messages retrieval endpoint" });
});

router.post("/:id/messages", authMiddleware, (req: Request, res: Response) => {
  res.status(200).json({ success: true, message: "Stub: Send message endpoint" });
});

export default router;
