import { z } from 'zod';

const completedGroupImageSchema = z.object({
  groupId: z.string(),
  file: z.instanceof(File),
  id: z.string(),
  expiresAt: z.iso.datetime(),
});

export const completedGroupImagesSchema = z
  .object({
    avatar: completedGroupImageSchema.optional(),
    cover: completedGroupImageSchema.optional(),
  })
  .default({});

export type TCompletedGroupImages = z.output<typeof completedGroupImagesSchema>;
