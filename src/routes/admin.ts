import { Router, type Request, type Response } from "express";
import { requirePortalAdmin } from "../middleware/admin";
import { catchAsync } from "../utils/catchAsync";
import { paramId } from "../utils/routeParams";
import * as adminService from "../services/adminService";

const router = Router();

router.use(requirePortalAdmin);

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

export default router;
