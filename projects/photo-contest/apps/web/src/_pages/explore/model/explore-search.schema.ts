import { z } from 'zod';

export const exploreSearchSchema = z.object({
  q: z
    .string()
    .transform((value) => value.trim().slice(0, 40))
    .catch(''),
});
