import type { z } from 'zod';

import { SupportInputSchema } from '@game-feedback/contracts';

export { SupportInputSchema };

export type TStartSupportDto = z.output<typeof SupportInputSchema>;
