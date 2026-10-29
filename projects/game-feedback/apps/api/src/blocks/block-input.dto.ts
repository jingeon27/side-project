import type { z } from 'zod';

import { BlockInputSchema } from '@game-feedback/contracts';

export { BlockInputSchema };

export type TBlockUserDto = z.output<typeof BlockInputSchema>;
