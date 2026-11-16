import { z } from 'zod';

/** 대회 화면의 글쓰기 링크가 넘긴 대회. 여러 값·빈 값처럼 링크가 만들지 않는 값은 일반 글쓰기로 연다. */
export const groupWriteSearchSchema = z.object({
  contestId: z.string().trim().min(1).max(100).optional().catch(undefined),
});
