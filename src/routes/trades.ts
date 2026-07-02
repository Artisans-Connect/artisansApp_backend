import { Router, type Request, type Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { supabaseAdmin } from "../config/supabase";
import { resolveTradeIntent } from "../services/smartSearchService";
import { appError } from "../utils/appError";

const router = Router();

type TradeWithCategoryIcon = {
  name: string | null;
  categories: { icon_name: string | null } | { icon_name: string | null }[] | null;
};

router.get(
  "/",
  catchAsync(async (_req: Request, res: Response) => {
    const { data, error } = await supabaseAdmin
      .from("subcategories")
      .select("name, categories(icon_name)")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    const trades = ((data ?? []) as TradeWithCategoryIcon[]).map((trade) => ({
      name: trade.name,
      icon_name: Array.isArray(trade.categories)
        ? trade.categories[0]?.icon_name ?? null
        : trade.categories?.icon_name ?? null,
    }));

    res.status(200).json({ success: true, data: trades });
  }),
);

router.post(
  "/resolve",
  catchAsync(async (req: Request, res: Response) => {
    const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
    if (!query) {
      throw appError(400, "Query string is required in request body", "VALIDATION_ERROR");
    }

    const { data, error } = await supabaseAdmin
      .from("subcategories")
      .select("name")
      .eq("is_active", true);

    if (error) {
      throw appError(500, error.message, "DATABASE_ERROR");
    }

    const tradeNames = (data ?? []).flatMap((trade) =>
      typeof trade.name === "string" ? [trade.name] : [],
    );
    const intent = await resolveTradeIntent(query, tradeNames);

    res.status(200).json({
      success: true,
      data: {
        matched: intent.matched,
        resolved_trade: intent.resolvedTrade,
      },
    });
  }),
);

export default router;
