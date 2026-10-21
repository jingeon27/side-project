import { z } from 'zod';

export const postEditSchema = z.object({
  title: z.string().trim().min(1, '제목을 입력해 주세요.').max(80, '80자 이내로 입력해 주세요.'),
  body: z.string().trim().max(5000, '5000자 이내로 입력해 주세요.'),
  categoryId: z.string(),
});
