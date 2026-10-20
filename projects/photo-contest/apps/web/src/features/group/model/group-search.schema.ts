import { z } from 'zod';

export const groupSearchSchema = z.object({
  q: z.string().trim().max(40, '검색어는 40자 이하로 입력해 주세요.'),
});
