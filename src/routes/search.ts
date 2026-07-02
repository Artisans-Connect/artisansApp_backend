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

    const { data: activeCategories, error: categoriesError } = await supabaseAdmin
      .from("categories")
      .select("id, name, slug, description, subcategories(name, slug, description)")
      .eq("is_active", true);

    if (categoriesError) {
      console.error("Failed to load search catalog:", categoriesError.message);
    }

    const catalog = (activeCategories ?? []).map((category) => ({
      slug: category.slug,
      name: category.name,
      description: category.description,
      subcategories: category.subcategories,
    }));

    const intent = await smartSearchService.parseSearchIntent(query, catalog);

    // Resolve slugs to full category DB records
    let resolvedCategories: { id: string; name: string; slug: string }[] = [];
    if (intent.categories.length > 0) {
      resolvedCategories = (activeCategories ?? [])
        .filter((category) => intent.categories.includes(category.slug))
        .map((category) => ({
          id: category.id,
          name: category.name,
          slug: category.slug,
        }));
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
