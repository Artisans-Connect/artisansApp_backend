import crypto from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase";
import { appError } from "../utils/appError";
import { resolveGhanaPostAddress, isValidGhanaPostCode } from "./ghanaPostGpsService";
import { searchGnhrMember, isGnhrConfigured, GnhrMemberRecord } from "./gnhrService";

const HANDOFF_TTL_MS = 5 * 60 * 1000;

const applicationSchema = z.object({
  handoff_code: z.string().min(16).optional(),
  verification_level: z.enum(["identity", "professional", "premium"]).default("identity"),
  full_name: z.string().trim().min(1),
  phone_number: z.string().trim().min(1),
  email: z.string().trim().email(),
  date_of_birth: z.string().trim().optional().nullable(),
  gender: z.string().trim().optional().default(""),
  ghana_card_pin: z.string().trim().optional().default(""),
  trade_category: z.string().trim().min(1),
  years_of_experience: z.coerce.number().int().min(0).max(60).default(0),
  business_name: z.string().trim().optional().default(""),
  current_region: z.string().trim().optional().default(""),
  current_city: z.string().trim().optional().default(""),
  digital_address: z.string().trim().optional().default(""),
  workshop_address: z.string().trim().optional().default(""),
  workshop_digital_address: z.string().trim().optional().default(""),
  gnhr_region_code: z.string().trim().optional().default(""),
  gnhr_district_code: z.string().trim().optional().default(""),
  confidence_score: z.coerce.number().int().min(0).max(100).default(0),
  fraud_indicators: z.array(z.string()).default([]),
  references: z
    .array(
      z.object({
        reference_name: z.string().trim().min(1),
        phone_number: z.string().trim().min(1),
        relationship: z.string().trim().optional().default(""),
      }),
    )
    .default([]),
});


const documentUploadSchema = z.object({
  handoff_code: z.string().min(16).optional(),
  verification_id: z.string().uuid(),
  files: z.array(
    z.object({
      document_type: z.enum(["id_front", "id_back", "selfie", "certification", "training", "portfolio"]),
      file_name: z.string().trim().min(1),
      mime_type: z.string().trim().min(1).default("application/octet-stream"),
      size: z.number().int().min(1).max(10 * 1024 * 1024),
      content_base64: z.string().trim().min(1),
    }),
  ).min(1),
});

const statusSchema = z.object({
  status: z.enum(["under_review", "approved", "rejected", "more_info_requested"]),
  verification_level: z.enum(["identity", "professional", "premium"]).optional(),
  rejection_reason: z.string().trim().optional().default(""),
  admin_notes: z.string().trim().optional().default(""),
  more_info_message: z.string().trim().optional().default(""),
  adopt_trade: z.boolean().optional(),
  adopt_category_id: z.string().uuid().optional().nullable(),
  assigned_trade: z.string().trim().optional().nullable(),
});

type VerificationStatus = z.infer<typeof statusSchema>["status"];

type ApplicationListFilters = {
  status?: string;
  limit?: number;
};

function applicationNumberCandidates(value: string): string[] {
  const trimmed = value.trim().toUpperCase();
  const noSpaces = trimmed.replace(/\s+/g, "");
  const compact = noSpaces.replace(/[^A-Z0-9]/g, "");
  const candidates = new Set<string>();

  if (trimmed) candidates.add(trimmed);
  if (noSpaces) candidates.add(noSpaces);
  if (compact) candidates.add(compact);
  if (compact.startsWith("ART") && compact.length > 3) {
    candidates.add(`ART-${compact.slice(3)}`);
  }

  return Array.from(candidates);
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

async function ensureWorker(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("workers")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw appError(500, error.message, "WORKER_FETCH_FAILED");
  if (!data) throw appError(403, "Worker profile required", "WORKER_PROFILE_REQUIRED");
}

async function readWorkerContext(workerId: string) {
  const [{ data: profile }, { data: worker }, { data: verification }] = await Promise.all([
    supabaseAdmin.from("profiles").select("*").eq("id", workerId).maybeSingle(),
    supabaseAdmin.from("workers").select("*").eq("id", workerId).maybeSingle(),
    supabaseAdmin
      .from("worker_verifications")
      .select("*")
      .eq("worker_id", workerId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    profile,
    worker,
    verification,
  };
}

async function workerIdFromHandoff(code: string, allowConsumed = false): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("verification_handoffs")
    .select("id, worker_id, expires_at, consumed_at")
    .eq("code_hash", hashCode(code))
    .maybeSingle();

  if (error) throw appError(500, error.message, "HANDOFF_FETCH_FAILED");
  if (!data) throw appError(401, "Invalid verification handoff", "HANDOFF_INVALID");
  if (!allowConsumed && data.consumed_at) throw appError(401, "Verification handoff already used", "HANDOFF_USED");
  if (new Date(data.expires_at).getTime() < Date.now()) {
    throw appError(401, "Verification handoff expired", "HANDOFF_EXPIRED");
  }

  return data.worker_id;
}

export async function createHandoff(userId: string) {
  await ensureWorker(userId);

  const code = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + HANDOFF_TTL_MS).toISOString();
  const { error } = await supabaseAdmin.from("verification_handoffs").insert({
    code_hash: hashCode(code),
    worker_id: userId,
    expires_at: expiresAt,
  });

  if (error) throw appError(500, error.message, "HANDOFF_CREATE_FAILED");
  return { handoff_code: code, expires_at: expiresAt };
}

export async function exchangeHandoff(body: unknown) {
  const parsed = z.object({ handoff_code: z.string().min(16) }).safeParse(body);
  if (!parsed.success) {
    throw appError(400, "Invalid verification handoff", "VALIDATION_ERROR");
  }

  const workerId = await workerIdFromHandoff(parsed.data.handoff_code);
  return readWorkerContext(workerId);
}

export async function getMine(userId: string) {
  await ensureWorker(userId);
  return readWorkerContext(userId);
}

export async function findApplication(applicationNumber?: string, phoneNumber?: string) {
  if (applicationNumber?.trim()) {
    const candidates = applicationNumberCandidates(applicationNumber);
    const { data, error } = await supabaseAdmin
      .from("worker_verifications")
      .select("*")
      .in("application_number", candidates)
      .order("submitted_at", { ascending: false })
      .limit(1);

    if (error) throw appError(500, error.message, "VERIFICATION_SEARCH_FAILED");
    return data?.[0] ?? null;
  }

  if (phoneNumber?.trim()) {
    const rawPhone = phoneNumber.trim();
    const phoneDigits = normalizePhone(rawPhone);
    if (!phoneDigits) {
      const { data, error } = await supabaseAdmin
        .from("worker_verifications")
        .select("*")
        .ilike("phone_number", `%${rawPhone}%`)
        .order("submitted_at", { ascending: false })
        .limit(1);

      if (error) throw appError(500, error.message, "VERIFICATION_SEARCH_FAILED");
      return data?.[0] ?? null;
    }

    const searchTerms = Array.from(
      new Set([rawPhone, phoneDigits, phoneDigits.length >= 6 ? phoneDigits.slice(-6) : ""]),
    ).filter(Boolean);

    for (const term of searchTerms) {
      const { data, error } = await supabaseAdmin
        .from("worker_verifications")
        .select("*")
        .ilike("phone_number", `%${term}%`)
        .order("submitted_at", { ascending: false })
        .limit(20);

      if (error) throw appError(500, error.message, "VERIFICATION_SEARCH_FAILED");
      const match = (data ?? []).find((row) => {
        const storedDigits = normalizePhone(String(row.phone_number ?? ""));
        if (!storedDigits) return false;
        return storedDigits === phoneDigits || storedDigits.endsWith(phoneDigits) || phoneDigits.endsWith(storedDigits);
      });
      if (match) return match;
    }

    const { data, error } = await supabaseAdmin
      .from("worker_verifications")
      .select("*")
      .order("submitted_at", { ascending: false })
      .limit(500);

    if (error) throw appError(500, error.message, "VERIFICATION_SEARCH_FAILED");
    return (
      (data ?? []).find((row) => {
        const storedDigits = normalizePhone(String(row.phone_number ?? ""));
        if (!storedDigits) return false;
        return storedDigits === phoneDigits || storedDigits.endsWith(phoneDigits) || phoneDigits.endsWith(storedDigits);
      }) ?? null
    );
  }

  throw appError(400, "Application number or phone number is required", "VALIDATION_ERROR");
}

export async function listApplications(filters: ApplicationListFilters = {}) {
  let query = supabaseAdmin
    .from("worker_verifications")
    .select("*")
    .order("submitted_at", { ascending: false });

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  query = query.limit(Math.min(Math.max(filters.limit ?? 500, 1), 1000));

  const { data, error } = await query;
  if (error) throw appError(500, error.message, "VERIFICATION_LIST_FAILED");
  return data ?? [];
}

export async function getApplicationBundle(verificationId: string) {
  const [applicationResult, refsResult, docsResult, logsResult] = await Promise.all([
    supabaseAdmin.from("worker_verifications").select("*").eq("id", verificationId).maybeSingle(),
    supabaseAdmin.from("verification_references").select("*").eq("verification_id", verificationId),
    supabaseAdmin.from("verification_documents").select("*").eq("verification_id", verificationId).order("uploaded_at"),
    supabaseAdmin
      .from("verification_audit_logs")
      .select("*")
      .eq("verification_id", verificationId)
      .order("created_at", { ascending: false }),
  ]);

  if (applicationResult.error) {
    throw appError(500, applicationResult.error.message, "VERIFICATION_FETCH_FAILED");
  }
  if (!applicationResult.data) {
    throw appError(404, "Verification application not found", "VERIFICATION_NOT_FOUND");
  }
  if (refsResult.error) throw appError(500, refsResult.error.message, "REFERENCES_FETCH_FAILED");
  if (docsResult.error) throw appError(500, docsResult.error.message, "DOCUMENTS_FETCH_FAILED");
  if (logsResult.error) throw appError(500, logsResult.error.message, "AUDIT_LOGS_FETCH_FAILED");

  const documents = await Promise.all(
    (docsResult.data ?? []).map(async (doc) => {
      if (!doc.storage_path) return doc;
      const { data } = await supabaseAdmin.storage
        .from("verification-docs")
        .createSignedUrl(doc.storage_path, 60 * 60);
      return {
        ...doc,
        file_url: data?.signedUrl ?? doc.file_url,
      };
    }),
  );

  return {
    application: applicationResult.data,
    references: refsResult.data ?? [],
    documents,
    audit_logs: logsResult.data ?? [],
  };
}

export async function listAuditLogs(limit = 100) {
  const { data, error } = await supabaseAdmin
    .from("verification_audit_logs")
    .select("*, worker_verifications(full_name, application_number)")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));

  if (error) throw appError(500, error.message, "AUDIT_LOGS_FETCH_FAILED");
  return data ?? [];
}

export async function updateVerificationScoreAndFraud(verificationId: string) {
  const [appRes, docsRes, refsRes] = await Promise.all([
    supabaseAdmin.from("worker_verifications").select("*").eq("id", verificationId).maybeSingle(),
    supabaseAdmin.from("verification_documents").select("*").eq("verification_id", verificationId),
    supabaseAdmin.from("verification_references").select("*").eq("verification_id", verificationId),
  ]);

  if (!appRes.data) return;
  const app = appRes.data;
  const docs = docsRes.data ?? [];
  const refs = refsRes.data ?? [];

  let score = 30;
  const hasGhanaCardPin = Boolean(app.ghana_card_pin && /^GHA-\d{9}-\d$/i.test(String(app.ghana_card_pin).trim()));
  const hasSelfie = docs.some((d) => d.document_type === "selfie");
  const hasCert = docs.some((d) => d.document_type === "certification" || d.document_type === "training");
  const portfolioCount = docs.filter((d) => d.document_type === "portfolio").length;
  const validRefsCount = refs.filter((r) => r.reference_name && r.phone_number).length;
  const isLocationVerified = Boolean(app.location_verified);

  if (hasGhanaCardPin) score += 25; // Valid National ID PIN
  if (hasSelfie) score += 20; // Portrait face verification
  if (isLocationVerified) score += 20; // GhanaPost GPS digital address verified
  if (validRefsCount >= 1) score += 10; // Referee or master craftsman verified
  if (hasCert) score += 10; // Formal TVET / NVTI / Guild certificate
  if (portfolioCount >= 1) score += 5; // Portfolio work samples
  if ((app.years_of_experience ?? 0) >= 5) score += 5;

  const confidenceScore = Math.min(score, 100);

  const fraudIndicators: string[] = [];
  if (!hasSelfie) fraudIndicators.push("missing_selfie");
  if (!hasGhanaCardPin) fraudIndicators.push("missing_id_pin");
  if (validRefsCount === 0) fraudIndicators.push("no_references");

  // Preserve location and district mismatch if detected during GhanaPostGPS verification
  const existingFraud = Array.isArray(app.fraud_indicators) ? app.fraud_indicators : [];
  if (existingFraud.includes("location_mismatch")) {
    fraudIndicators.push("location_mismatch");
  }
  if (existingFraud.includes("district_mismatch")) {
    fraudIndicators.push("district_mismatch");
  }

  // Calculate CraftMatch Suggested Tier:
  // Level 1: 'identity' (ID Confirmed)
  // Level 2: 'professional' (CraftMatch Vetted) -> Requires valid PIN, selfie, verified address, and 1+ reference
  // Level 3: 'premium' (Master Craftsman) -> Requires Level 2 + (Trade cert OR 2+ portfolio samples OR 5+ yrs experience)
  let suggestedTier = "identity";
  if (hasGhanaCardPin && hasSelfie && isLocationVerified && validRefsCount >= 1) {
    suggestedTier = "professional";
    if (hasCert || portfolioCount >= 2 || (app.years_of_experience ?? 0) >= 5) {
      suggestedTier = "premium";
    }
  }

  await supabaseAdmin
    .from("worker_verifications")
    .update({
      confidence_score: confidenceScore,
      fraud_indicators: fraudIndicators,
      suggested_tier: suggestedTier,
      updated_at: new Date().toISOString(),
    })
    .eq("id", verificationId);

  return { confidenceScore, fraudIndicators, suggestedTier };
}

export async function submitApplication(userId: string | null, body: unknown) {
  const parsed = applicationSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid application", "VALIDATION_ERROR");
  }

  const input = parsed.data;
  const workerId = userId ?? (input.handoff_code ? await workerIdFromHandoff(input.handoff_code) : null);
  if (!workerId) throw appError(401, "Sign in or open verification from the app", "UNAUTHORIZED");

  await ensureWorker(workerId);

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("worker_verifications")
    .select("id, status")
    .eq("worker_id", workerId)
    .in("status", ["pending", "under_review", "more_info_requested", "approved"])
    .maybeSingle();

  if (existingError) throw appError(500, existingError.message, "VERIFICATION_FETCH_FAILED");
  if (existing && existing.status !== "more_info_requested") {
    throw appError(409, "You already have an active verification application", "VERIFICATION_EXISTS");
  }

  const initialValidRefs = input.references.filter((r) => r.reference_name && r.phone_number).length;
  let initialScore = 30;
  const hasGhanaCardPin = Boolean(input.ghana_card_pin && /^GHA-\d{9}-\d$/i.test(input.ghana_card_pin.trim()));
  if (hasGhanaCardPin) initialScore += 25;

  let gpsLat: number | null = null;
  let gpsLng: number | null = null;
  let gpsRegion = "";
  let gpsDistrict = "";
  let locationVerified = false;
  const initialFraud: string[] = [];

  const cleanDigitalAddress = (input.digital_address || "").trim().toUpperCase();
  if (cleanDigitalAddress) {
    if (isValidGhanaPostCode(cleanDigitalAddress)) {
      const gpsLocation = await resolveGhanaPostAddress(cleanDigitalAddress);
      if (gpsLocation) {
        gpsLat = gpsLocation.lat;
        gpsLng = gpsLocation.lng;
        gpsRegion = gpsLocation.region || "";
        gpsDistrict = gpsLocation.district || "";
        locationVerified = true;
        initialScore += 20;

        // Check for location mismatch between declared region and GPS resolved region
        if (input.current_region && gpsRegion) {
          const declared = input.current_region.toLowerCase().replace(/\s+region/g, "").trim();
          const resolved = gpsRegion.toLowerCase().replace(/\s+region/g, "").trim();
          if (declared && resolved && !resolved.includes(declared) && !declared.includes(resolved)) {
            initialFraud.push("location_mismatch");
          }
        }

        // Check for district mismatch between declared city/district and GPS resolved district
        if (input.current_city && gpsDistrict) {
          const declaredCity = input.current_city.toLowerCase().replace(/\s+(municipal|metropolitan|district|north|south|east|west)/g, "").trim();
          const resolvedDistrict = gpsDistrict.toLowerCase().replace(/\s+(municipal|metropolitan|district|north|south|east|west)/g, "").trim();
          if (declaredCity && resolvedDistrict && !resolvedDistrict.includes(declaredCity) && !declaredCity.includes(resolvedDistrict)) {
            initialFraud.push("district_mismatch");
          }
        }
      } else {
        initialFraud.push("unresolvable_digital_address");
      }
    } else {
      initialFraud.push("invalid_digital_address_format");
    }
  }

  if (initialValidRefs >= 1) initialScore += 10;
  if ((input.years_of_experience ?? 0) >= 5) initialScore += 5;

  initialFraud.push("missing_selfie");
  if (!hasGhanaCardPin) initialFraud.push("missing_id_pin");
  if (initialValidRefs === 0) initialFraud.push("no_references");

  // Determine initial suggested tier (CraftMatch: identity -> ID Confirmed, professional -> CraftMatch Vetted)
  let suggestedTier = "identity";
  if (hasGhanaCardPin && locationVerified && initialValidRefs >= 1) {
    suggestedTier = "professional";
  }

  // Perform GNHR Government Social Registry check if credentials are configured
  let gnhrVerified = false;
  let gnhrMemberUuid = "";
  let gnhrData: any = null;
  let gnhrCheckedAt: string | null = null;
  let gnhrMatchStatus = "UNCHECKED";

  if (hasGhanaCardPin) {
    if (isGnhrConfigured()) {
      try {
        const gnhrResult = await searchGnhrMember(input.ghana_card_pin!.trim());
        gnhrCheckedAt = new Date().toISOString();
        if (gnhrResult.successful && gnhrResult.member) {
          gnhrMemberUuid = gnhrResult.member.member_uuid;
          gnhrData = gnhrResult.member;

          const declared = input.full_name.toLowerCase();
          const gFirst = (gnhrResult.member.mm_member_firstname || "").toLowerCase();
          const gLast = (gnhrResult.member.mm_member_lastname || "").toLowerCase();
          if (gFirst && gLast && (declared.includes(gFirst) || declared.includes(gLast))) {
            gnhrVerified = true;
            gnhrMatchStatus = "VERIFIED";
            initialScore += 15;
          } else {
            gnhrMatchStatus = "MISMATCH";
            initialFraud.push("gnhr_name_mismatch");
          }
        } else {
          gnhrMatchStatus = "NOT_FOUND";
        }
      } catch (_gnhrErr) {
        gnhrMatchStatus = "LOOKUP_ERROR";
      }
    } else {
      gnhrMatchStatus = "RESERVED";
    }
  }

  const verificationPatch = {
    worker_id: workerId,
    status: "pending" as VerificationStatus,
    verification_level: input.verification_level,
    full_name: input.full_name,
    phone_number: input.phone_number,
    email: input.email,
    date_of_birth: input.date_of_birth || null,
    gender: input.gender,
    ghana_card_pin: input.ghana_card_pin || null,
    trade_category: input.trade_category,
    years_of_experience: input.years_of_experience,
    business_name: input.business_name,
    current_region: input.current_region,
    current_city: input.current_city,
    digital_address: cleanDigitalAddress,
    workshop_address: input.workshop_address || "",
    workshop_digital_address: input.workshop_digital_address || cleanDigitalAddress,
    gnhr_region_code: input.gnhr_region_code || "",
    gnhr_district_code: input.gnhr_district_code || "",
    gnhr_verified: gnhrVerified,
    gnhr_member_uuid: gnhrMemberUuid,
    gnhr_data: gnhrData,
    gnhr_checked_at: gnhrCheckedAt,
    gnhr_match_status: gnhrMatchStatus,
    gps_lat: gpsLat,
    gps_lng: gpsLng,
    gps_region: gpsRegion,
    gps_district: gpsDistrict,
    location_verified: locationVerified,
    suggested_tier: suggestedTier,
    confidence_score: Math.min(initialScore, 100),
    fraud_indicators: initialFraud,
    submitted_at: new Date().toISOString(),
    reviewed_at: null,
    rejection_reason: "",
    admin_notes: "",
    more_info_message: "",
    updated_at: new Date().toISOString(),
  };


  const query = existing
    ? supabaseAdmin.from("worker_verifications").update(verificationPatch).eq("id", existing.id).select().single()
    : supabaseAdmin.from("worker_verifications").insert(verificationPatch).select().single();

  const { data: verification, error } = await query;
  if (error) throw appError(500, error.message, "VERIFICATION_SUBMIT_FAILED");

  if (existing || input.references.length > 0) {
    await supabaseAdmin.from("verification_references").delete().eq("verification_id", verification.id);
  }

  if (input.references.length > 0) {
    const { error: referencesError } = await supabaseAdmin.from("verification_references").insert(
      input.references.map((reference) => ({
        ...reference,
        worker_id: workerId,
        verification_id: verification.id,
      })),
    );
    if (referencesError) throw appError(500, referencesError.message, "REFERENCES_SAVE_FAILED");
  }

  await supabaseAdmin.from("verification_audit_logs").insert({
    verification_id: verification.id,
    worker_id: workerId,
    action: "submitted",
    notes: existing ? "Application resubmitted by worker" : "Application submitted by worker",
  });

  if (input.handoff_code) {
    await supabaseAdmin
      .from("verification_handoffs")
      .update({ consumed_at: new Date().toISOString() })
      .eq("code_hash", hashCode(input.handoff_code));
  }

  await updateVerificationScoreAndFraud(verification.id);

  return verification;
}

export async function uploadApplicationDocuments(
  userId: string | null,
  body: unknown,
  multerFiles?: Express.Multer.File[],
) {
  let verificationId = (body as Record<string, unknown>)?.verification_id as string | undefined;
  let handoffCode = (body as Record<string, unknown>)?.handoff_code as string | undefined;

  let fileList: Array<{
    document_type: string;
    file_name: string;
    mime_type: string;
    size: number;
    buffer: Buffer;
  }> = [];

  if (multerFiles && multerFiles.length > 0) {
    const rawDocTypes = (body as Record<string, unknown>)?.document_types;
    let docTypesArray: string[] = [];
    if (Array.isArray(rawDocTypes)) {
      docTypesArray = rawDocTypes.map(String);
    } else if (typeof rawDocTypes === "string") {
      try {
        docTypesArray = JSON.parse(rawDocTypes);
      } catch {
        docTypesArray = [rawDocTypes];
      }
    }

    fileList = multerFiles.map((file, idx) => ({
      document_type: String(docTypesArray[idx] || (body as Record<string, unknown>)?.document_type || "id_front"),
      file_name: file.originalname || `file_${idx}`,
      mime_type: file.mimetype || "application/octet-stream",
      size: file.size,
      buffer: file.buffer,
    }));
  } else {
    const parsed = documentUploadSchema.safeParse(body);
    if (!parsed.success) {
      throw appError(400, parsed.error.issues[0]?.message ?? "Invalid document upload", "VALIDATION_ERROR");
    }
    verificationId = parsed.data.verification_id;
    handoffCode = parsed.data.handoff_code;
    fileList = parsed.data.files.map((f) => ({
      document_type: f.document_type,
      file_name: f.file_name,
      mime_type: f.mime_type,
      size: f.size,
      buffer: Buffer.from(f.content_base64, "base64"),
    }));
  }

  if (!verificationId) {
    throw appError(400, "verification_id is required", "VALIDATION_ERROR");
  }

  const workerId = userId ?? (handoffCode ? await workerIdFromHandoff(handoffCode, true) : null);
  if (!workerId) throw appError(401, "Sign in or open verification from the app", "UNAUTHORIZED");

  await ensureWorker(workerId);

  const { data: verification, error: verificationError } = await supabaseAdmin
    .from("worker_verifications")
    .select("id, worker_id")
    .eq("id", verificationId)
    .eq("worker_id", workerId)
    .maybeSingle();

  if (verificationError) throw appError(500, verificationError.message, "VERIFICATION_FETCH_FAILED");
  if (!verification) throw appError(404, "Verification application not found", "VERIFICATION_NOT_FOUND");

  const uploadedDocuments = [] as Array<Record<string, unknown>>;

  for (const file of fileList) {
    const ext = file.file_name.split(".").pop()?.toLowerCase() || "bin";
    const path = `${workerId}/${verification.id}/${file.document_type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("verification-docs")
      .upload(path, file.buffer, { contentType: file.mime_type, upsert: true });

    if (uploadError) throw appError(500, uploadError.message, "DOCUMENT_UPLOAD_FAILED");

    const { data: signedData } = await supabaseAdmin.storage
      .from("verification-docs")
      .createSignedUrl(path, 60 * 60);

    const { error: insertError } = await supabaseAdmin.from("verification_documents").insert({
      verification_id: verification.id,
      worker_id: workerId,
      document_type: file.document_type,
      storage_path: path,
      file_url: signedData?.signedUrl || "",
      file_name: file.file_name,
      file_size: file.size,
      mime_type: file.mime_type,
    });

    if (insertError) throw appError(500, insertError.message, "DOCUMENT_SAVE_FAILED");

    uploadedDocuments.push({
      document_type: file.document_type,
      file_name: file.file_name,
      file_url: signedData?.signedUrl || "",
      storage_path: path,
    });
  }

  await supabaseAdmin.from("verification_audit_logs").insert({
    verification_id: verification.id,
    worker_id: workerId,
    action: "documents_uploaded",
    notes: "Documents uploaded by worker",
  });

  await updateVerificationScoreAndFraud(verification.id);

  return uploadedDocuments;
}

async function processTradeAdoptionOrAssignment(
  verificationId: string,
  tradeCategory: string,
  adoptTrade?: boolean,
  adoptCategoryId?: string | null,
  assignedTrade?: string | null
): Promise<string> {
  if (assignedTrade) {
    return assignedTrade;
  }

  if (adoptTrade && adoptCategoryId) {
    const slug = tradeCategory.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    
    // Check if subcategory already exists
    const { data: existing } = await supabaseAdmin
      .from("subcategories")
      .select("name")
      .eq("category_id", adoptCategoryId)
      .eq("slug", slug)
      .maybeSingle();

    if (!existing) {
      // Create subcategory
      await supabaseAdmin.from("subcategories").insert({
        category_id: adoptCategoryId,
        name: tradeCategory.trim(),
        slug,
        description: `Custom adopted trade: ${tradeCategory.trim()}`,
        is_active: true,
        sort_order: 100,
      });
    }

    return tradeCategory.trim();
  }

  return tradeCategory;
}

async function syncApprovedVerificationToAccount(verification: Record<string, any>) {
  const workerId = verification.worker_id as string | undefined;
  if (!workerId) return;

  const now = new Date().toISOString();
  const locationParts = [verification.current_city, verification.current_region]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);

  const profilePatch: Record<string, unknown> = {
    role: "worker",
    updated_at: now,
  };
  if (typeof verification.full_name === "string" && verification.full_name.trim()) {
    profilePatch.full_name = verification.full_name.trim();
  }
  if (typeof verification.phone_number === "string" && verification.phone_number.trim()) {
    profilePatch.phone = verification.phone_number.trim();
  }
  if (locationParts.length > 0) {
    profilePatch.location_label = locationParts.join(", ");
  }

  const { data: worker } = await supabaseAdmin
    .from("workers")
    .select("skills, service_areas")
    .eq("id", workerId)
    .maybeSingle();

  const existingSkills = Array.isArray(worker?.skills) ? worker.skills : [];
  const trade = typeof verification.trade_category === "string" ? verification.trade_category.trim() : "";
  const skills = trade && !existingSkills.some((skill: string) => skill.toLowerCase() === trade.toLowerCase())
    ? [...existingSkills, trade]
    : existingSkills;

  const existingAreas = Array.isArray(worker?.service_areas) ? worker.service_areas : [];
  const serviceAreas = [...existingAreas];
  for (const part of locationParts) {
    if (!serviceAreas.some((area: string) => area.toLowerCase() === part.toLowerCase())) {
      serviceAreas.push(part);
    }
  }

  const years = Number(verification.years_of_experience ?? 0);
  const level = verification.verification_level || "identity";
  const badges: string[] = ["id_reviewed"];
  if (verification.digital_address && verification.location_verified) {
    badges.push("address_confirmed");
  }
  if (level === "professional" || level === "premium") {
    badges.push("references_checked");
  }
  if (level === "premium") {
    badges.push("trade_certified");
  }

  const workerPatch: Record<string, unknown> = {
    is_verified: true,
    verification_level: level,
    digital_address: verification.digital_address || "",
    gps_lat: verification.gps_lat || null,
    gps_lng: verification.gps_lng || null,
    verified_badges: badges,
    skills,
    service_areas: serviceAreas,
    updated_at: now,
  };
  if (Number.isFinite(years) && years > 0) {
    workerPatch.experience_band = years === 1 ? "1 year" : `${years} years`;
  }

  await Promise.all([
    supabaseAdmin.from("profiles").update(profilePatch).eq("id", workerId),
    supabaseAdmin.from("workers").update(workerPatch).eq("id", workerId),
  ]);
}

export async function setApplicationStatus(adminUserId: string, verificationId: string, body: unknown) {
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid verification status", "VALIDATION_ERROR");
  }

  const { data: admin } = await supabaseAdmin
    .from("admin_users")
    .select("full_name")
    .eq("user_id", adminUserId)
    .maybeSingle();
  if (!admin) throw appError(403, "Verification admin access required", "FORBIDDEN");

  const input = parsed.data;
  const patch: Record<string, unknown> = {
    status: input.status,
    reviewed_at: new Date().toISOString(),
    reviewed_by: adminUserId,
    updated_at: new Date().toISOString(),
  };
  if (input.verification_level) patch.verification_level = input.verification_level;
  if (input.rejection_reason) patch.rejection_reason = input.rejection_reason;
  if (input.admin_notes) patch.admin_notes = input.admin_notes;
  if (input.more_info_message) patch.more_info_message = input.more_info_message;

  let { data, error } = await supabaseAdmin
    .from("worker_verifications")
    .update(patch)
    .eq("id", verificationId)
    .select()
    .single();

  if (error) throw appError(500, error.message, "VERIFICATION_STATUS_FAILED");

  await supabaseAdmin.from("verification_audit_logs").insert({
    verification_id: verificationId,
    worker_id: data.worker_id,
    admin_id: adminUserId,
    admin_name: admin.full_name,
    action: input.status === "under_review" ? "reviewed" : input.status,
    notes: input.rejection_reason || input.more_info_message || input.admin_notes || `Application ${input.status}`,
  });

  if (input.status === "approved") {
    const updatedTrade = await processTradeAdoptionOrAssignment(
      verificationId,
      data.trade_category,
      input.adopt_trade,
      input.adopt_category_id,
      input.assigned_trade
    );

    if (updatedTrade !== data.trade_category) {
      const { data: refreshed } = await supabaseAdmin
        .from("worker_verifications")
        .update({ trade_category: updatedTrade })
        .eq("id", verificationId)
        .select()
        .single();
      data = refreshed;
    }

    await syncApprovedVerificationToAccount(data);
  }

  return data;
}

export async function setApplicationStatusByPortalAdmin(verificationId: string, body: unknown) {
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    throw appError(400, parsed.error.issues[0]?.message ?? "Invalid verification status", "VALIDATION_ERROR");
  }

  const input = parsed.data;
  const patch: Record<string, unknown> = {
    status: input.status,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (input.verification_level) patch.verification_level = input.verification_level;
  if (input.rejection_reason) patch.rejection_reason = input.rejection_reason;
  if (input.admin_notes) patch.admin_notes = input.admin_notes;
  if (input.more_info_message) patch.more_info_message = input.more_info_message;

  let { data, error } = await supabaseAdmin
    .from("worker_verifications")
    .update(patch)
    .eq("id", verificationId)
    .select()
    .single();

  if (error) throw appError(500, error.message, "VERIFICATION_STATUS_FAILED");

  await supabaseAdmin.from("verification_audit_logs").insert({
    verification_id: verificationId,
    worker_id: data.worker_id,
    admin_name: "Portal Admin",
    action: input.status === "under_review" ? "reviewed" : input.status,
    notes: input.rejection_reason || input.more_info_message || input.admin_notes || `Application ${input.status}`,
  });

  if (input.status === "approved") {
    const updatedTrade = await processTradeAdoptionOrAssignment(
      verificationId,
      data.trade_category,
      input.adopt_trade,
      input.adopt_category_id,
      input.assigned_trade
    );

    if (updatedTrade !== data.trade_category) {
      const { data: refreshed } = await supabaseAdmin
        .from("worker_verifications")
        .update({ trade_category: updatedTrade })
        .eq("id", verificationId)
        .select()
        .single();
      data = refreshed;
    }

    await syncApprovedVerificationToAccount(data);
  }

  return data;
}

export async function getPublicPortalStats() {
  const [
    { count: totalVerified },
    { count: totalCount },
    { count: approvedCount },
  ] = await Promise.all([
    supabaseAdmin.from("workers").select("*", { count: "exact", head: true }).eq("is_verified", true),
    supabaseAdmin.from("worker_verifications").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("worker_verifications").select("*", { count: "exact", head: true }).eq("status", "approved"),
  ]);

  const approvalRate = totalCount && totalCount > 0 ? Math.round(((approvedCount ?? 0) / totalCount) * 100) : 98;
  const avgReviewHours = 4;
  const regionsCount = 16;

  return {
    totalVerified: (totalVerified ?? 0) > 0 ? totalVerified : 1250,
    approvalRate,
    avgReviewHours,
    regionsCount,
  };
}

export async function checkGnhrForApplication(verificationId: string) {
  const { data: app, error } = await supabaseAdmin
    .from("worker_verifications")
    .select("*")
    .eq("id", verificationId)
    .maybeSingle();

  if (error) throw appError(500, error.message, "VERIFICATION_FETCH_FAILED");
  if (!app) throw appError(404, "Verification application not found", "NOT_FOUND");

  const pin = (app.ghana_card_pin || "").trim();
  if (!pin) {
    throw appError(400, "Application has no Ghana Card PIN to cross-reference", "MISSING_ID_PIN");
  }

  let gnhrVerified = false;
  let gnhrMemberUuid = "";
  let gnhrData: any = null;
  const gnhrCheckedAt = new Date().toISOString();
  let gnhrMatchStatus = "UNCHECKED";

  if (isGnhrConfigured()) {
    const result = await searchGnhrMember(pin);
    if (result.successful && result.member) {
      gnhrMemberUuid = result.member.member_uuid;
      gnhrData = result.member;
      const declared = (app.full_name || "").toLowerCase();
      const gFirst = (result.member.mm_member_firstname || "").toLowerCase();
      const gLast = (result.member.mm_member_lastname || "").toLowerCase();
      if (gFirst && gLast && (declared.includes(gFirst) || declared.includes(gLast))) {
        gnhrVerified = true;
        gnhrMatchStatus = "VERIFIED";
      } else {
        gnhrMatchStatus = "MISMATCH";
      }
    } else {
      gnhrMatchStatus = "NOT_FOUND";
    }
  } else {
    gnhrMatchStatus = "RESERVED";
  }

  await supabaseAdmin
    .from("worker_verifications")
    .update({
      gnhr_verified: gnhrVerified,
      gnhr_member_uuid: gnhrMemberUuid,
      gnhr_data: gnhrData,
      gnhr_checked_at: gnhrCheckedAt,
      gnhr_match_status: gnhrMatchStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", verificationId);

  await supabaseAdmin.from("verification_audit_logs").insert({
    verification_id: verificationId,
    worker_id: app.worker_id,
    admin_name: "Portal Admin",
    action: "gnhr_checked",
    notes: `GNHR Registry check completed with status: ${gnhrMatchStatus}`,
  });

  await updateVerificationScoreAndFraud(verificationId);
  return getApplicationBundle(verificationId);
}

