import { z } from 'zod';

export const MediaMimeTypeSchema = z.enum([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
]);
export const MediaSizeSchema = z
  .number()
  .int()
  .positive()
  .max(25 * 1024 * 1024);
export const MediaUploadInputSchema = z
  .object({ name: z.string().trim().min(1).max(1000), mimeType: MediaMimeTypeSchema, size: MediaSizeSchema })
  .strict();
export const MediaUploadPlanSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('PROXY') }).strict(),
  z
    .object({
      mode: z.literal('DIRECT'),
      id: z.string().min(1).max(100),
      url: z.url(),
      fields: z.record(z.string(), z.string()),
      expiresAt: z.iso.datetime(),
    })
    .strict(),
]);
export type TMediaUploadInput = z.output<typeof MediaUploadInputSchema>;
export type TMediaUploadPlan = z.output<typeof MediaUploadPlanSchema>;
