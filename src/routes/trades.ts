import { Router, type Request, type Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { supabaseAdmin } from "../config/supabase";

const router = Router();

router.get(
  "/",
  catchAsync(async (_req: Request, res: Response) => {
    const { data, error } = await supabaseAdmin
      .from("subcategories")
      .select("name")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    res.status(200).json({ success: true, data: data ?? [] });
  }),
);

export default router;
