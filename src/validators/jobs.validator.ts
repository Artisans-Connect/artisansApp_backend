import { z } from "zod";
import { JOB_MODE, JOB_STATUS } from "../constants/enums";

const jobMode = z.enum([JOB_MODE.ASAP, JOB_MODE.SCHEDULED, JOB_MODE.FLEXIBLE]);
const budgetType = z.enum(["fixed", "range", "negotiable"]);
const serviceType = z.enum(["home_visit", "remote", "either"]);

export const createJobSchema = z
  .object({
    category_id: z.string().trim().min(1),
    title: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1),
    photo_urls: z.array(z.string().url()).default([]),
    location_lat: z.number().min(-90).max(90),
    location_lng: z.number().min(-180).max(180),
    address_label: z.string().trim().min(1),
    job_mode: jobMode,
    budget_type: budgetType,
    budget_fixed: z.number().positive().optional(),
    budget_min: z.number().positive().optional(),
    budget_max: z.number().positive().optional(),
    scheduled_for: z.string().datetime().optional(),
    service_type: serviceType,
    requested_worker_id: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.budget_type === "fixed" && data.budget_fixed == null) {
      ctx.addIssue({ code: "custom", message: "budget_fixed is required for fixed budget", path: ["budget_fixed"] });
    }
    if (data.budget_type === "range") {
      if (data.budget_min == null || data.budget_max == null) {
        ctx.addIssue({ code: "custom", message: "budget_min and budget_max are required for range budget", path: ["budget_min"] });
      } else if (data.budget_min > data.budget_max) {
        ctx.addIssue({ code: "custom", message: "budget_min must be <= budget_max", path: ["budget_min"] });
      }
    }
    if (data.job_mode === JOB_MODE.SCHEDULED && !data.scheduled_for) {
      ctx.addIssue({ code: "custom", message: "scheduled_for is required for scheduled jobs", path: ["scheduled_for"] });
    }
  });

export function initialJobStatus(jobMode: string): string {
  if (jobMode === JOB_MODE.SCHEDULED) return JOB_STATUS.DRAFT;
  return JOB_STATUS.SEARCHING;
}

export const completeJobSchema = z.object({
  proposed_amount: z.number().positive().max(999999.99).optional(),
  hours_spent: z.number().positive().max(999.99).optional(),
  materials_used: z.string().trim().max(1000).optional(),
  notes: z.string().trim().max(2000).optional(),
  photo_urls: z.array(z.string().url()).default([]),
});
