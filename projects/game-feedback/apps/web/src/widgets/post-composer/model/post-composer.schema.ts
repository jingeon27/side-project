import { PostInputSchema } from '@game-feedback/contracts';
import { z } from 'zod';

export const postComposerSchema = PostInputSchema.extend({
  editorValid: z.boolean().refine(Boolean),
});
