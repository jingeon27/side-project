import type { z } from 'zod';

import { AnswerInputSchema, HelpfulInputSchema } from '@game-feedback/contracts';

export { AnswerInputSchema, HelpfulInputSchema };

export type TAnswerBodyDto = z.output<typeof AnswerInputSchema>;
export type THelpfulDto = z.output<typeof HelpfulInputSchema>;
