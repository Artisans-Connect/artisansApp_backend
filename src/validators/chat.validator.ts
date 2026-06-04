import { z } from "zod";

export const sendMessageSchema = z
  .object({
    content: z.string().trim().optional().default(''),
    image_urls: z.array(z.string().url()).default([]),
  })
  .superRefine((value, ctx) => {
    if (!value.content.trim() && value.image_urls.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Message must contain text or at least one image.',
        path: ['content'],
      });
    }
  });
