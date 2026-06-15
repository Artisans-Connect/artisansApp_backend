import { z } from "zod";
import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";

const nullableText = z.string().trim().optional().nullable();

const categorySchema = z.object({
  name: z.string().trim().min(2),
  slug: z.string().trim().min(2).regex(/^[a-z0-9_-]+$/),
  icon_name: nullableText,
  color_hex: nullableText,
  description: nullableText,
  sort_order: z.coerce.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

const categoryPatchSchema = categorySchema.partial();

const subcategorySchema = z.object({
  name: z.string().trim().min(2),
  slug: z.string().trim().min(2).regex(/^[a-z0-9_-]+$/),
  description: nullableText,
  sort_order: z.coerce.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

const subcategoryPatchSchema = subcategorySchema.partial();

const suspendSchema = z.object({
  reason: z.string().trim().min(3),
});

function validationError(message: string) {
  return appError(400, message, "VALIDATION_ERROR");
}

function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Invalid request";
}

export async function listAdminCategories() {
  const { data, error } = await supabaseAdmin
    .from("categories")
    .select("id, name, slug, icon_name, color_hex, description, sort_order, is_active, created_at, subcategories(id, category_id, name, slug, description, sort_order, is_active, created_at)")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .order("sort_order", { foreignTable: "subcategories", ascending: true });

  if (error) throw appError(500, error.message, "ADMIN_CATEGORIES_FETCH_FAILED");
  return data ?? [];
}

export async function createCategory(body: unknown) {
  const parsed = categorySchema.safeParse(body);
  if (!parsed.success) throw validationError(firstIssue(parsed.error));

  const { data, error } = await supabaseAdmin
    .from("categories")
    .insert(parsed.data)
    .select("id, name, slug, icon_name, color_hex, description, sort_order, is_active, created_at")
    .single();

  if (error) throw appError(500, error.message, "ADMIN_CATEGORY_CREATE_FAILED");
  return data;
}

export async function updateCategory(categoryId: string, body: unknown) {
  const parsed = categoryPatchSchema.safeParse(body);
  if (!parsed.success) throw validationError(firstIssue(parsed.error));
  if (Object.keys(parsed.data).length === 0) throw validationError("No category changes provided");

  const { data, error } = await supabaseAdmin
    .from("categories")
    .update(parsed.data)
    .eq("id", categoryId)
    .select("id, name, slug, icon_name, color_hex, description, sort_order, is_active, created_at")
    .maybeSingle();

  if (error) throw appError(500, error.message, "ADMIN_CATEGORY_UPDATE_FAILED");
  if (!data) throw appError(404, "Category not found", "CATEGORY_NOT_FOUND");
  return data;
}

export async function createSubcategory(categoryId: string, body: unknown) {
  const parsed = subcategorySchema.safeParse(body);
  if (!parsed.success) throw validationError(firstIssue(parsed.error));

  const { data, error } = await supabaseAdmin
    .from("subcategories")
    .insert({ ...parsed.data, category_id: categoryId })
    .select("id, category_id, name, slug, description, sort_order, is_active, created_at")
    .single();

  if (error) throw appError(500, error.message, "ADMIN_SUBCATEGORY_CREATE_FAILED");
  return data;
}

export async function updateSubcategory(subcategoryId: string, body: unknown) {
  const parsed = subcategoryPatchSchema.safeParse(body);
  if (!parsed.success) throw validationError(firstIssue(parsed.error));
  if (Object.keys(parsed.data).length === 0) throw validationError("No subcategory changes provided");

  const { data, error } = await supabaseAdmin
    .from("subcategories")
    .update(parsed.data)
    .eq("id", subcategoryId)
    .select("id, category_id, name, slug, description, sort_order, is_active, created_at")
    .maybeSingle();

  if (error) throw appError(500, error.message, "ADMIN_SUBCATEGORY_UPDATE_FAILED");
  if (!data) throw appError(404, "Subcategory not found", "SUBCATEGORY_NOT_FOUND");
  return data;
}

export async function listAccounts(query: { q?: string; status?: string; role?: string }) {
  let request = supabaseAdmin
    .from("profiles")
    .select("id, full_name, phone, role, signup_type, last_active_mode, avatar_url, account_status, suspended_at, suspension_reason, created_at, updated_at, workers(id, is_available, is_verified, rating, total_jobs, skills, service_areas)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (query.status === "active" || query.status === "suspended") {
    request = request.eq("account_status", query.status);
  }

  if (query.role === "client" || query.role === "worker") {
    request = request.or(`signup_type.eq.${query.role},role.eq.${query.role},last_active_mode.eq.${query.role}`);
  }

  if (query.q?.trim() && !query.q.includes("@")) {
    const q = query.q.trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q)) {
      request = request.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,id.eq.${q}`);
    } else {
      request = request.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`);
    }
  }

  const { data, error } = await request;
  if (error) throw appError(500, error.message, "ADMIN_ACCOUNTS_FETCH_FAILED");

  const accounts = data ?? [];
  const ids = accounts.map((account) => account.id);
  const [{ data: verifications }, { data: authUsers }] = await Promise.all([
    ids.length
      ? supabaseAdmin
          .from("worker_verifications")
          .select("worker_id, status, verification_level, application_number, submitted_at")
          .in("worker_id", ids)
          .order("submitted_at", { ascending: false })
      : { data: [] },
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const verificationByWorker = new Map<string, Record<string, unknown>>();
  for (const verification of verifications ?? []) {
    const workerId = verification.worker_id as string;
    if (!verificationByWorker.has(workerId)) {
      verificationByWorker.set(workerId, verification);
    }
  }

  const authById = new Map(
    (authUsers?.users ?? []).map((user) => [
      user.id,
      {
        email: user.email ?? null,
        phone: user.phone ?? null,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
      },
    ]),
  );

  const enriched = accounts.map((account) => ({
    ...account,
    auth_user: authById.get(account.id) ?? null,
    verification: verificationByWorker.get(account.id) ?? null,
  }));

  const q = query.q?.trim().toLowerCase();
  const searched = q
    ? enriched.filter((account) => {
        const authUser = account.auth_user;
        return (
          (account.full_name ?? "").toLowerCase().includes(q) ||
          (account.phone ?? "").toLowerCase().includes(q) ||
          (authUser?.email ?? "").toLowerCase().includes(q) ||
          account.id.toLowerCase() === q
        );
      })
    : enriched;

  if (query.role !== "verified_worker") return searched;

  return searched.filter((account) => {
    const worker = Array.isArray(account.workers) ? account.workers[0] : account.workers;
    return Boolean(worker?.is_verified);
  });
}

export async function getAccountDetail(accountId: string) {
  const [{ data: profile, error: profileError }, { data: jobs }, { data: applications }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("*, workers(*)")
      .eq("id", accountId)
      .maybeSingle(),
    supabaseAdmin
      .from("jobs")
      .select("id, title, status, created_at, updated_at, categories(name)")
      .or(`client_id.eq.${accountId},worker_id.eq.${accountId}`)
      .order("created_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("job_applications")
      .select("id, job_id, status, created_at, jobs(title, status)")
      .eq("worker_id", accountId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (profileError) throw appError(500, profileError.message, "ADMIN_ACCOUNT_FETCH_FAILED");
  if (!profile) throw appError(404, "Account not found", "ACCOUNT_NOT_FOUND");

  const [{ data: authUser }, { data: verifications }] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(accountId),
    supabaseAdmin
      .from("worker_verifications")
      .select("*")
      .eq("worker_id", accountId)
      .order("submitted_at", { ascending: false })
      .limit(5),
  ]);
  return {
    profile,
    auth_user: authUser.user
      ? {
          id: authUser.user.id,
          email: authUser.user.email,
          phone: authUser.user.phone,
          created_at: authUser.user.created_at,
          last_sign_in_at: authUser.user.last_sign_in_at,
        }
      : null,
    verifications: verifications ?? [],
    recent_jobs: jobs ?? [],
    recent_applications: applications ?? [],
  };
}

export async function suspendAccount(accountId: string, body: unknown) {
  const parsed = suspendSchema.safeParse(body);
  if (!parsed.success) throw validationError(firstIssue(parsed.error));

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({
      account_status: "suspended",
      suspended_at: now,
      suspension_reason: parsed.data.reason,
      updated_at: now,
    })
    .eq("id", accountId)
    .select("id, full_name, account_status, suspended_at, suspension_reason")
    .maybeSingle();

  if (error) throw appError(500, error.message, "ADMIN_ACCOUNT_SUSPEND_FAILED");
  if (!data) throw appError(404, "Account not found", "ACCOUNT_NOT_FOUND");

  await supabaseAdmin
    .from("workers")
    .update({ is_available: false, updated_at: now })
    .eq("id", accountId);

  return data;
}

export async function reactivateAccount(accountId: string) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({
      account_status: "active",
      suspended_at: null,
      suspension_reason: null,
      updated_at: now,
    })
    .eq("id", accountId)
    .select("id, full_name, account_status, suspended_at, suspension_reason")
    .maybeSingle();

  if (error) throw appError(500, error.message, "ADMIN_ACCOUNT_REACTIVATE_FAILED");
  if (!data) throw appError(404, "Account not found", "ACCOUNT_NOT_FOUND");
  return data;
}
