import { z } from 'zod';

import { topicSchema } from '@/shared/topics';

export const recordInput = z
  .object({
    topic: topicSchema,
    action: z.string().trim().min(1).max(180),
    note: z.string().trim().max(240),
  })
  .strict();
export const recordSchema = recordInput.extend({ date: z.iso.date() });
export type TDeokRecord = z.infer<typeof recordSchema>;
