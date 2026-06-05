import { z } from "zod";

export const sendMessageSchema = z
  .object({
    content: z.string().trim().optional().default(''),
    image_urls: z.array(z.string().url()).default([]),
    media_urls: z.array(z.string().url()).default([]),
    media_types: z.array(z.enum(['image', 'video'])).default([]),
    client_message_id: z.string().uuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.content.trim() && value.image_urls.length === 0 && value.media_urls.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Message must contain text or at least one media item.',
        path: ['content'],
      });
    }
    if (value.media_types.length > 0 && value.media_types.length !== value.media_urls.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'media_types must match media_urls length.',
        path: ['media_types'],
      });
    }
  });
