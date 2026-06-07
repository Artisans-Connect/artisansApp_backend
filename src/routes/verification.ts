import { Router, type Request, type Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { catchAsync } from "../utils/catchAsync";
import { paramId } from "../utils/routeParams";
import * as verificationService from "../services/verificationService";
import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";
import { env } from "../config/env";

const router = Router();

async function readBearerUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) throw appError(401, "Invalid or expired token", "UNAUTHORIZED");
  return data.user.id;
}

function requirePortalAdmin(req: Request) {
  const configuredKey = env.VERIFICATION_ADMIN_KEY;
  if (!configuredKey && env.NODE_ENV !== "production") return;
  const providedKey = req.get("x-verification-admin-key");
  if (!configuredKey || providedKey !== configuredKey) {
    throw appError(403, "Verification admin access required", "FORBIDDEN");
  }
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

router.get(
  "/applications/search",
  catchAsync(async (req: Request, res: Response) => {
    const application = await verificationService.findApplication(
      typeof req.query.application_number === "string" ? req.query.application_number : undefined,
      typeof req.query.phone_number === "string" ? req.query.phone_number : undefined,
    );
    res.status(200).json({ success: true, data: application });
  }),
);

router.get(
  "/admin/applications",
  catchAsync(async (req: Request, res: Response) => {
    requirePortalAdmin(req);
    const applications = await verificationService.listApplications({
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      limit: typeof req.query.limit === "string" ? Number(req.query.limit) : undefined,
    });
    res.status(200).json({ success: true, data: applications });
  }),
);

router.get(
  "/admin/applications/:id",
  catchAsync(async (req: Request, res: Response) => {
    requirePortalAdmin(req);
    const bundle = await verificationService.getApplicationBundle(paramId(req.params.id));
    res.status(200).json({ success: true, data: bundle });
  }),
);

router.get(
  "/admin/audit-logs",
  catchAsync(async (req: Request, res: Response) => {
    requirePortalAdmin(req);
    const logs = await verificationService.listAuditLogs(
      typeof req.query.limit === "string" ? Number(req.query.limit) : undefined,
    );
    res.status(200).json({ success: true, data: logs });
  }),
);

router.patch(
  "/admin/applications/:id/status",
  catchAsync(async (req: Request, res: Response) => {
    requirePortalAdmin(req);
    const application = await verificationService.setApplicationStatusByPortalAdmin(
      paramId(req.params.id),
      req.body,
    );
    res.status(200).json({ success: true, data: application });
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

router.post(
  "/me/application/documents",
  catchAsync(async (req: Request, res: Response) => {
    const userId = await readBearerUserId(req);
    const documents = await verificationService.uploadApplicationDocuments(userId, req.body);
    res.status(201).json({ success: true, data: documents });
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
