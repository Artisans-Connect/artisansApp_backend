import { Router, type Request, type Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { catchAsync } from "../utils/catchAsync";
import * as smartSearchService from "../services/smartSearchService";
import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";

const router = Router();

router.post(
  "/parse-intent",
  authMiddleware,
  catchAsync(async (req: Request, res: Response) => {
    const { query } = req.body;
    if (typeof query !== "string") {
      throw appError(400, "Query string is required in request body", "VALIDATION_ERROR");
    }

    const intent = await smartSearchService.parseSearchIntent(query);

    // Resolve slugs to full category DB records
    let resolvedCategories: { id: string; name: string; slug: string }[] = [];
    if (intent.categories.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("categories")
        .select("id, name, slug")
        .in("slug", intent.categories)
        .eq("is_active", true);

      if (error) {
        console.error("Failed to resolve category slugs:", error.message);
      } else if (data) {
        resolvedCategories = data;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        categories: resolvedCategories,
        refinedQuery: intent.refinedQuery,
        intentSummary: intent.intentSummary,
      },
    });
  }),
);

export default router;
