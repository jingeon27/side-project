import type { z } from 'zod';

import { ListQuerySchema } from '@game-feedback/contracts';

export { ListQuerySchema };

export type TListQueryDto = z.output<typeof ListQuerySchema>;
