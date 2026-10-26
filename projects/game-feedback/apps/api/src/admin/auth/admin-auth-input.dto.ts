import type { z } from 'zod';

import { AdminLoginInputSchema } from '@game-feedback/contracts';

export { AdminLoginInputSchema };

export type TAdminLoginDto = z.output<typeof AdminLoginInputSchema>;
