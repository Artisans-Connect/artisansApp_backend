import { z } from "zod";

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1),
  image_urls: z.array(z.string().url()).default([]),
});
