import { HideInputSchema } from '@game-feedback/contracts';

export const reportVisibilitySchema = HideInputSchema.pick({ reason: true });
