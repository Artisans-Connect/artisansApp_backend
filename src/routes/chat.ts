import { Router, type Request, type Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { catchAsync } from "../utils/catchAsync";
import * as chatService from "../services/chatService";
import { paramId } from "../utils/routeParams";

const router = Router();

router.get(
  "/",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const conversations = await chatService.listConversations(req.user!.id);
    res.status(200).json({ success: true, data: conversations });
  }),
);

router.post(
  "/direct",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const conversation = await chatService.createDirectConversation(req.user!.id, req.body);
    res.status(201).json({ success: true, data: conversation });
  }),
);

router.get(
  "/:id/messages",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const messages = await chatService.getMessages(req.user!.id, paramId(req.params.id));
    res.status(200).json({ success: true, data: messages });
  }),
);

router.post(
  "/:id/messages",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const message = await chatService.sendMessage(req.user!.id, paramId(req.params.id), req.body);
    res.status(201).json({ success: true, data: message });
  }),
);

export default router;
