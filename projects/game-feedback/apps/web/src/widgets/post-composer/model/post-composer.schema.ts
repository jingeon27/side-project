import { PostInputSchema } from '@game-feedback/contracts';
import { z } from 'zod';
import type { UseFormReturn } from 'react-hook-form';

export const postComposerSchema = PostInputSchema.extend({
  editorValid: z.boolean().refine(Boolean),
});

export type TPostComposerForm = UseFormReturn<
  z.input<typeof postComposerSchema>,
  unknown,
  z.output<typeof postComposerSchema>
>;
