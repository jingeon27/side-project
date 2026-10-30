import { z } from 'zod';

export const groupCategorySchema = z.object({
  name: z.string().trim().min(1, '카테고리 이름을 입력해 주세요.').max(20, '20자 이내로 입력해 주세요.'),
});

export function moveGroupCategory(ids: readonly string[], id: string, direction: -1 | 1) {
  const index = ids.indexOf(id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= ids.length) return [...ids];
  const result = [...ids];
  result.splice(index, 1);
  result.splice(next, 0, id);
  return result;
}
