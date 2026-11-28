import { z } from 'zod';

import { elementSchema, readingSchema } from '@/features/reading/contracts';
import { findEpisode } from '@/shared/episodes';
import { topics, topicSchema } from '@/shared/topics';

import { recordInput } from './contract';

const pageSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('message'),
      episode: z
        .string()
        .max(90)
        .refine((slug) => Boolean(findEpisode(slug))),
      text: z.string().trim().min(1).max(240),
    })
    .strict(),
  z
    .object({
      kind: z.literal('reading'),
      topic: topicSchema,
      concern: z.string().max(32),
      element: elementSchema,
      reading: readingSchema.strict(),
    })
    .strict(),
  recordInput.extend({ kind: z.literal('practice') }).strict(),
]);
export const activitySchema = z
  .object({
    id: z.string().regex(/^[0-9a-f]{64}$/),
    date: z.iso.date(),
    createdAt: z.iso.datetime(),
    page: pageSchema,
  })
  .strict()
  .refine(
    ({ page }) =>
      page.kind !== 'reading' || topics[page.topic].concerns.some((item) => item.id === page.concern),
  );
export type TActivity = z.infer<typeof activitySchema>;
export type TActivityPage = TActivity['page'];
