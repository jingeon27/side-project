import { z } from 'zod';
import { GroupVisibility } from '@/shared/api/generated';

export const createGroupSchema = z.object({
  name: z.string().trim().min(1, '그룹 이름을 입력해 주세요.').max(40, '40자 이내로 입력해 주세요.'),
  visibility: z.enum(GroupVisibility),
  description: z.string().trim().max(500, '500자 이내로 입력해 주세요.').default(''),
});

export type TCreateGroupInput = z.input<typeof createGroupSchema>;
