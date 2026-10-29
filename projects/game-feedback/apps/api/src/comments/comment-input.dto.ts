import type { z } from 'zod';

import { CommentInputSchema, CreateCommentInputSchema } from '@game-feedback/contracts';

export { CommentInputSchema, CreateCommentInputSchema };

export type TCommentBodyDto = z.output<typeof CommentInputSchema>;
export type TCreateCommentBodyDto = z.output<typeof CreateCommentInputSchema>;
