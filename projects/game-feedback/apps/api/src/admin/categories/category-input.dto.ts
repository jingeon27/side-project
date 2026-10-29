import type { z } from 'zod';

import { CategoryInputSchema } from '@game-feedback/contracts';

export { CategoryInputSchema };

export type TCreateCategoryDto = z.output<typeof CategoryInputSchema>;
