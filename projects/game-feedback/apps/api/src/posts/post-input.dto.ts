import type { z } from 'zod';

import { PostInputSchema, PostPatchSchema, PostViewInputSchema } from '@game-feedback/contracts';

export { PostInputSchema, PostPatchSchema, PostViewInputSchema };

export type TCreatePostDto = z.output<typeof PostInputSchema>;
export type TUpdatePostDto = z.output<typeof PostPatchSchema>;
export type TPostViewDto = z.output<typeof PostViewInputSchema>;
