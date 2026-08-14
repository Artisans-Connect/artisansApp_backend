import { Router, type Request, type Response } from "express";
import { requirePortalAdmin } from "../middleware/admin";
import { catchAsync } from "../utils/catchAsync";
import { paramId } from "../utils/routeParams";
import * as adminService from "../services/adminService";
import * as reportsService from "../services/reportsService";
import * as notificationsService from "../services/notificationsService";

const router = Router();

router.use(requirePortalAdmin);

router.post(
  "/broadcast-notification",
  catchAsync(async (req: Request, res: Response) => {
    const result = await notificationsService.broadcastNotification(req.body);
    res.status(201).json({ success: true, data: result });
  }),
);

router.get(
  "/dashboard-stats",
  catchAsync(async (_req: Request, res: Response) => {
    const stats = await adminService.getDashboardStats();
    res.status(200).json({ success: true, data: stats });
  }),
);

router.get(
  "/categories",
  catchAsync(async (_req: Request, res: Response) => {
    const categories = await adminService.listAdminCategories();
    res.status(200).json({ success: true, data: categories });
  }),
);

router.post(
  "/categories",
  catchAsync(async (req: Request, res: Response) => {
    const category = await adminService.createCategory(req.body);
    res.status(201).json({ success: true, data: category });
  }),
);

router.patch(
  "/categories/:id",
  catchAsync(async (req: Request, res: Response) => {
    const category = await adminService.updateCategory(paramId(req.params.id), req.body);
    res.status(200).json({ success: true, data: category });
  }),
);

router.post(
  "/categories/:id/subcategories",
  catchAsync(async (req: Request, res: Response) => {
    const subcategory = await adminService.createSubcategory(paramId(req.params.id), req.body);
    res.status(201).json({ success: true, data: subcategory });
  }),
);

router.patch(
  "/subcategories/:id",
  catchAsync(async (req: Request, res: Response) => {
    const subcategory = await adminService.updateSubcategory(paramId(req.params.id), req.body);
    res.status(200).json({ success: true, data: subcategory });
  }),
);

router.get(
  "/accounts",
  catchAsync(async (req: Request, res: Response) => {
    const accounts = await adminService.listAccounts({
      q: typeof req.query.q === "string" ? req.query.q : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      role: typeof req.query.role === "string" ? req.query.role : undefined,
    });
    res.status(200).json({ success: true, data: accounts });
  }),
);

router.get(
  "/accounts/:id",
  catchAsync(async (req: Request, res: Response) => {
    const account = await adminService.getAccountDetail(paramId(req.params.id));
    res.status(200).json({ success: true, data: account });
  }),
);

router.patch(
  "/accounts/:id/suspend",
  catchAsync(async (req: Request, res: Response) => {
    const account = await adminService.suspendAccount(paramId(req.params.id), req.body);
    res.status(200).json({ success: true, data: account });
  }),
);

router.patch(
  "/accounts/:id/reactivate",
  catchAsync(async (req: Request, res: Response) => {
    const account = await adminService.reactivateAccount(paramId(req.params.id));
    res.status(200).json({ success: true, data: account });
  }),
);

router.patch(
  "/accounts/:id/tier",
  catchAsync(async (req: Request, res: Response) => {
    const result = await adminService.updateAccountVerificationTier(paramId(req.params.id), req.body);
    res.status(200).json({ success: true, data: result });
  }),
);

// TRUST & SAFETY MODERATION DASHBOARD ENDPOINTS
router.get(
  "/reports",
  catchAsync(async (req: Request, res: Response) => {
    const reports = await reportsService.listAdminReports({
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      priority: typeof req.query.priority === "string" ? req.query.priority : undefined,
      category: typeof req.query.category === "string" ? req.query.category : undefined,
      is_emergency: typeof req.query.is_emergency === "string" ? req.query.is_emergency : undefined,
      q: typeof req.query.q === "string" ? req.query.q : undefined,
    });
    res.status(200).json({ success: true, data: reports });
  }),
);

router.get(
  "/reports/:id",
  catchAsync(async (req: Request, res: Response) => {
    const reportId = paramId(req.params.id);
    const detail = await reportsService.getAdminReportDetail(reportId);
    res.status(200).json({ success: true, data: detail });
  }),
);

router.patch(
  "/reports/:id",
  catchAsync(async (req: Request, res: Response) => {
    const reportId = paramId(req.params.id);
    const moderatorId = req.user?.id ?? "00000000-0000-0000-0000-000000000000";
    const updated = await reportsService.updateReportModeration(reportId, moderatorId, req.body);
    res.status(200).json({ success: true, data: updated });
  }),
);

router.get(
  "/reports/risk/:userId",
  catchAsync(async (req: Request, res: Response) => {
    const userId = paramId(req.params.userId);
    const risk = await reportsService.calculateRepeatOffenderRisk(userId);
    res.status(200).json({ success: true, data: risk });
  }),
);

export default router;
