import type { FieldPolicy, Reference } from '@apollo/client/cache';

interface IOffsetPageStore {
  items: readonly Reference[];
  nextOffset: number | null;
}

export function offsetPagePagination(keyArgs: string[]): FieldPolicy<IOffsetPageStore> {
  return {
    keyArgs,
    merge(existing, incoming, { args }) {
      const offset = typeof args?.offset === 'number' ? args.offset : 0;
      const end = offset + incoming.items.length;
      const items = existing?.items.slice(0, incoming.nextOffset === null ? end : undefined) ?? [];
      incoming.items.forEach((item, index) => {
        items[offset + index] = item;
      });
      // 이미 뒤 페이지가 캐시에 있으면 그 페이지가 받은 다음 offset을 사용한다.
      const nextOffset = existing && end < items.length ? existing.nextOffset : incoming.nextOffset;
      return { ...incoming, items, nextOffset };
    },
  };
}
