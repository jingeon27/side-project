import type { z } from 'zod';

import { UpdateProfileInputSchema } from '@game-feedback/contracts';

export { UpdateProfileInputSchema };

export type TUpdateProfileDto = z.output<typeof UpdateProfileInputSchema>;
