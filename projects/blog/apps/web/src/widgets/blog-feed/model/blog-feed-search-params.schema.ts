import { z } from 'zod';

import { categories } from '@/shared/article/model/categories';

export const blogFeedSearchParamsSchema = z.object({
  q: z.string().optional().catch(undefined),
  category: z.enum(categories).optional().catch(undefined),
});
