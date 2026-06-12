import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";

export async function listCategories() {
  const { data, error } = await supabaseAdmin
    .from("categories")
    .select("id, name, slug, icon_name, color_hex, description, sort_order, subcategories(id, name, slug, description, sort_order)")
    .eq("is_active", true)
    .eq("subcategories.is_active", true)
    .order("sort_order", { ascending: true })
    .order("sort_order", { foreignTable: "subcategories", ascending: true });

  if (error) throw appError(500, error.message, "CATEGORIES_FETCH_FAILED");
  return data ?? [];
}
