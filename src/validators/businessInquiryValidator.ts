import { z } from "zod";

export const BUSINESS_TYPES = [
  "Property Management",
  "Real Estate Developer",
  "Commercial Facility / Offices",
  "Hotel / Hospitality / Airbnb",
  "Educational Institution",
  "Retail / Branch Network",
  "Other",
] as const;

export const INQUIRY_STATUSES = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "PROPOSAL_SENT",
  "CONVERTED",
  "CLOSED",
] as const;

export const createBusinessInquirySchema = z.object({
  business_name: z.string().trim().min(2, "Business name is required").max(200),
  contact_name: z.string().trim().min(2, "Contact person name is required").max(150),
  phone: z
    .string()
    .trim()
    .min(9, "Valid phone number is required")
    .max(20)
    .regex(/^[+0-9\s()-]+$/, "Phone number contains invalid characters"),
  email: z.string().trim().email("Invalid email format").optional().or(z.literal("")),
  business_type: z.string().trim().default("Property Management"),
  units_count: z.string().trim().max(50).optional().default(""),
  message: z.string().trim().max(2000).optional().default(""),
});

export const updateBusinessInquirySchema = z.object({
  status: z.enum(INQUIRY_STATUSES).optional(),
  notes: z.string().trim().max(2000).optional(),
  assigned_to: z.string().uuid().optional().nullable(),
});
