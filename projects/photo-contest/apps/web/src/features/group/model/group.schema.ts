import { z } from 'zod';

export const createGroupSchema = z.object({
  name: z.string().trim().min(1, '갤러리 이름을 입력해 주세요.').max(40, '40자 이내로 입력해 주세요.'),
});

export type TCreateGroupInput = z.input<typeof createGroupSchema>;
