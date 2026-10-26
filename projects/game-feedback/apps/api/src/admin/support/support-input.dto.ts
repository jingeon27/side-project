import type { z } from 'zod';

import { SupportStatusInputSchema } from '@game-feedback/contracts';

export { SupportStatusInputSchema };

export type TSupportStatusDto = z.output<typeof SupportStatusInputSchema>;
