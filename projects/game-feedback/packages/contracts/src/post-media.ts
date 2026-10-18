import { z } from 'zod';

export const PostMediaUrlSchema = z.string().regex(/^\/api\/post-media\/[A-Za-z0-9_-]{1,100}$/);
export const RichTextEmbedSchema = z.union([
  z.object({ image: PostMediaUrlSchema }).strict(),
  z.object({ video: PostMediaUrlSchema }).strict(),
]);
export type TRichTextEmbed = z.infer<typeof RichTextEmbedSchema>;
export const PostMediaSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']),
  size: z
    .number()
    .int()
    .positive()
    .max(25 * 1024 * 1024),
  kind: z.enum(['IMAGE', 'VIDEO']),
  url: PostMediaUrlSchema,
});
export type TPostMedia = z.infer<typeof PostMediaSchema>;
export const PostMediaUploadSchema = z.object({ file: z.string().meta({ format: 'binary' }) });
