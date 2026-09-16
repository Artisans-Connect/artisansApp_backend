import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";
import {
  createBusinessInquirySchema,
  updateBusinessInquirySchema,
} from "../validators/businessInquiryValidator";

export interface BusinessInquiry {
  id: string;
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  business_type: string;
  units_count: string;
  message: string;
  status: "NEW" | "CONTACTED" | "QUALIFIED" | "PROPOSAL_SENT" | "CONVERTED" | "CLOSED";
  notes: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

function normalizeInquiryPayload(raw: any) {
  if (!raw || typeof raw !== "object") return {};
  return {
    business_name: raw.business_name || raw.businessName || "",
    contact_name: raw.contact_name || raw.contactName || "",
    phone: raw.phone || raw.phoneNumber || "",
    email: raw.email || "",
    business_type: raw.business_type || raw.businessType || "Property Management",
    units_count: raw.units_count || raw.unitsCount || "",
    message: raw.message || "",
  };
}

export async function createBusinessInquiry(payload: unknown) {
  const normalized = normalizeInquiryPayload(payload);
  const parsed = createBusinessInquirySchema.safeParse(normalized);

  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message || "Invalid inquiry details", "VALIDATION_ERROR");
  }

  const { data, error } = await supabaseAdmin
    .from("business_inquiries")
    .insert({
      business_name: parsed.data.business_name,
      contact_name: parsed.data.contact_name,
      phone: parsed.data.phone,
      email: parsed.data.email || "",
      business_type: parsed.data.business_type,
      units_count: parsed.data.units_count || "",
      message: parsed.data.message || "",
      status: "NEW",
    })
    .select()
    .single();

  if (error) {
    // If table doesn't exist yet or DB issue, log and provide clear fallback
    console.error("Failed to insert business inquiry into DB:", error.message);
    throw appError(500, "Unable to register corporate inquiry at this time", "INQUIRY_INSERT_FAILED");
  }

  return data as BusinessInquiry;
}

export async function listBusinessInquiries(filters: {
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 100);
  const offset = Math.max(Number(filters.offset) || 0, 0);

  let query = supabaseAdmin
    .from("business_inquiries")
    .select("*, assigned:profiles!assigned_to(id, full_name, email)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.status && filters.status !== "ALL") {
    query = query.eq("status", filters.status);
  }

  const { data, error, count } = await query;

  if (error) {
    throw appError(500, error.message, "INQUIRIES_FETCH_FAILED");
  }

  return {
    inquiries: (data || []) as BusinessInquiry[],
    total: count || 0,
    limit,
    offset,
  };
}

export async function updateBusinessInquiry(id: string, payload: unknown) {
  const parsed = updateBusinessInquirySchema.safeParse(payload);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message || "Invalid update data", "VALIDATION_ERROR");
  }

  const patch: Record<string, unknown> = {
    ...parsed.data,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("business_inquiries")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw appError(500, error.message, "INQUIRY_UPDATE_FAILED");
  }

  return data as BusinessInquiry;
}
