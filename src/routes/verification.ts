import { Router, type Request, type Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { catchAsync } from "../utils/catchAsync";
import { paramId } from "../utils/routeParams";
import * as verificationService from "../services/verificationService";
import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";

const router = Router();

async function readBearerUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw appError(401, "Invalid or expired token", "UNAUTHORIZED");
  return data.user.id;
}

router.post(
  "/handoff",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const handoff = await verificationService.createHandoff(req.user!.id);
    res.status(201).json({ success: true, data: handoff });
  }),
);

router.post(
  "/handoff/exchange",
  catchAsync(async (req: Request, res: Response) => {
    const context = await verificationService.exchangeHandoff(req.body);
    res.status(200).json({ success: true, data: context });
  }),
);

router.get(
  "/me",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const context = await verificationService.getMine(req.user!.id);
    res.status(200).json({ success: true, data: context });
  }),
);

router.post(
  "/me/application",
  catchAsync(async (req: Request, res: Response) => {
    const userId = await readBearerUserId(req);
    const application = await verificationService.submitApplication(userId, req.body);
    res.status(201).json({ success: true, data: application });
  }),
);

router.patch(
  "/applications/:id/status",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const application = await verificationService.setApplicationStatus(
      req.user!.id,
      paramId(req.params.id),
      req.body,
    );
    res.status(200).json({ success: true, data: application });
  }),
);

export default router;
