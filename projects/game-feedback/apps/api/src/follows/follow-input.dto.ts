import type { z } from 'zod';

import { FollowInputSchema } from '@game-feedback/contracts';

export { FollowInputSchema };

export type TFollowUserDto = z.output<typeof FollowInputSchema>;
