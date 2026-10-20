import { z } from 'zod';

export const userSearchSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,100}$/),
});
