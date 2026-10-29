import type { z } from 'zod';

import { UserBanInputSchema, VerificationInputSchema } from '@game-feedback/contracts';

export { VerificationInputSchema, UserBanInputSchema };

export type TVerificationDto = z.output<typeof VerificationInputSchema>;
export type TUserBanDto = z.output<typeof UserBanInputSchema>;
