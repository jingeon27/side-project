import type { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

import { PostInputSchema } from '@game-feedback/contracts';

export const postComposerSchema = PostInputSchema.extend({
  editorValid: z.boolean().refine(Boolean),
});

export type TPostComposerForm = UseFormReturn<
  z.input<typeof postComposerSchema>,
  unknown,
  z.output<typeof postComposerSchema>
>;
