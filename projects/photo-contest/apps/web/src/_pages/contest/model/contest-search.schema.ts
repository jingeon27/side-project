import { z } from 'zod';

export const contestSearchSchema = z.object({ sort: z.enum(['latest', 'popular']).catch('latest') });
