import { readFileSync } from 'node:fs';

import { z } from 'zod';

// TS 평가 게이트와 Python 게시 검사가 같은 파일을 읽어 한쪽만 기준이 바뀌지 않게 한다.
export const QUALIFICATION = z
  .object({
    version: z.literal(1),
    minimumPairs: z.int().positive(),
    minimumMeanScore: z.number().gt(0.5).lt(1),
    familyAlpha: z.number().gt(0).max(0.05),
    resultLabelPattern: z.string().min(1),
  })
  .strict()
  .parse(JSON.parse(readFileSync(new URL('../../contracts/qualification.json', import.meta.url), 'utf8')));

// 시도 k마다 familyAlpha/((k+1)(k+2))를 써서 모든 시도의 합이 familyAlpha를 넘지 않는다.
export const attemptAlpha = (attempt: number) => QUALIFICATION.familyAlpha / ((attempt + 1) * (attempt + 2));

export const RESULT_LABEL = new RegExp(QUALIFICATION.resultLabelPattern);
