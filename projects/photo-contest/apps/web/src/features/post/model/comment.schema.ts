import { z } from 'zod';

export const commentSchema = z.object({
  body: z.string().trim().min(1, '댓글을 입력해 주세요.').max(1000, '댓글은 1000자 이내로 입력해 주세요.'),
});
