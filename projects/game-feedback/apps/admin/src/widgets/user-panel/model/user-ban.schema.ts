import { UserBanInputSchema } from '@game-feedback/contracts';

export const userBanSchema = UserBanInputSchema.pick({ reason: true });
