import type { z } from 'zod';

import type { OnboardInputSchema } from '@game-feedback/contracts';

export type TOnboardInput = z.input<typeof OnboardInputSchema>;
