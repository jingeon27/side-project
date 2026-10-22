import { z } from 'zod';

import { PAGE_OFFSET_MAX, PAGE_SIZE_MAX } from '../config/limits';
import { fail } from './errors';

export interface IPageRange {
  offset: number;
  limit: number;
}

const pageRangeSchema = z.object({
  // 깊은 OFFSET은 건너뛰는 행을 모두 읽으므로 반복 요청으로 DB를 붙잡지 못하게 막는다.
  offset: z.int().min(0).max(PAGE_OFFSET_MAX),
  limit: z.int().min(1).max(PAGE_SIZE_MAX),
});

/** 앞뒤 공백을 지우고 1~max자인지 확인한다. */
export function textValue(value: unknown, max: number, label: string) {
  const parsed = z.string().trim().min(1).max(max).safeParse(value);
  if (!parsed.success) fail(`${label}은(는) 1~${max}자여야 합니다.`);
  return parsed.data;
}

export function pageRange(offset: unknown, limit: unknown): IPageRange {
  const parsed = pageRangeSchema.safeParse({ offset, limit });
  if (!parsed.success) fail('올바른 목록 범위를 지정해 주세요.');
  return parsed.data;
}
