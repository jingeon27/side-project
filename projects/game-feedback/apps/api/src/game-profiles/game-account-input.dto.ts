import type { z } from 'zod';

import { GameAccountInputSchema } from '@game-feedback/contracts';

export { GameAccountInputSchema };

export type TGameAccountDto = z.output<typeof GameAccountInputSchema>;
