import { Router, type Request, type Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import * as categoriesService from "../services/categoriesService";

const router = Router();

router.get(
  "/",
  catchAsync(async (_req: Request, res: Response) => {
    const categories = await categoriesService.listCategories();
    res.status(200).json({ success: true, data: categories });
  }),
);

export default router;
