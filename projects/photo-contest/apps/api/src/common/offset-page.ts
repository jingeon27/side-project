import { PAGE_OFFSET_MAX } from '../config/limits';
import type { IPageRange } from './validation';

export function offsetPage<T>(rows: readonly T[], { offset, limit }: IPageRange) {
  const nextOffset = offset + limit;
  return {
    items: rows.slice(0, limit),
    nextOffset: rows.length > limit && nextOffset <= PAGE_OFFSET_MAX ? nextOffset : null,
  };
}
