import { z } from 'zod';

import { topics, topicSchema } from '@/shared/topics';

import { experienceThemeSchema } from './experience';

export const elementSchema = z.enum(['wood', 'fire', 'earth', 'metal', 'water']);
export type TElement = z.infer<typeof elementSchema>;

export const readingInputSchema = z
  .object({
    topic: topicSchema,
    concern: z.string().max(32),
    element: elementSchema,
    experience: experienceThemeSchema.optional(),
  })
  .strict()
  .refine((value) => topics[value.topic].concerns.some(({ id }) => id === value.concern));

export type TReadingInput = z.infer<typeof readingInputSchema>;

export const readingSchema = z.object({
  interpretation: z.string().min(10).max(480),
  mode: z.enum(['basic', 'ai']),
  action: z.string().min(1).max(120).optional(),
  sources: z
    .array(z.object({ id: z.string(), title: z.string() }))
    .max(2)
    .optional(),
});
export type TReading = z.infer<typeof readingSchema>;

export const birthSchema = z.object({
  calendar: z.enum(['solar', 'lunar']),
  date: z.string().regex(/^(\d{8}|\d{4}-\d{2}-\d{2})$/, '생년월일을 숫자 8자리로 적어 주세요.'),
  time: z.union([z.literal(''), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]),
  leapMonth: z.boolean(),
});

export type TBirthInput = z.infer<typeof birthSchema>;

export class BirthDateError extends Error {}
