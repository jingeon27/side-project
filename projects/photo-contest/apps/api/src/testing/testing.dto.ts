import { z } from 'zod';

import { TEXT_LIMIT } from '../config/limits';
import { PHASE } from '../contest/contest.policy';

export const CreateTestUserSchema = z.strictObject({
  nickname: z.string().trim().min(1).max(TEXT_LIMIT.NICKNAME),
  needsOnboarding: z
    .boolean()
    .nullish()
    .transform((value) => value ?? undefined),
  avatar: z
    .url({ protocol: /^https$/ })
    .nullish()
    .transform((value) => value ?? undefined),
});
export type TCreateTestUserDto = z.output<typeof CreateTestUserSchema>;

export const MoveTestContestSchema = z.strictObject({
  phase: z.enum(PHASE, { error: '테스트 입력을 확인해 주세요.' }),
});
export type TMoveTestContestDto = z.output<typeof MoveTestContestSchema>;
