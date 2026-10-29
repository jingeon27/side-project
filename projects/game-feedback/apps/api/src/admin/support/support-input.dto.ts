import type { z } from 'zod';

import { AdminSupportListQuerySchema, SupportStatusInputSchema } from '@game-feedback/contracts';

export { AdminSupportListQuerySchema, SupportStatusInputSchema };

export type TSupportStatusDto = z.output<typeof SupportStatusInputSchema>;
export type TAdminSupportListQueryDto = z.output<typeof AdminSupportListQuerySchema>;
