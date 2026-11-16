import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { uniqBy } from 'es-toolkit';

import { Button } from '@side/design-system';

import { threadListOptions } from '@/features/support';
import type { TSupportStatusFilter } from '@/shared/lib';

import { SupportThreadCard } from './SupportThreadCard';

export function SupportThreadList({ status }: { status: TSupportStatusFilter }) {
  const query = useSuspenseInfiniteQuery(threadListOptions(status));
  const threads = uniqBy(
    query.data.pages.flatMap((page) => page.items),
    (thread) => thread.id,
  );
  return (
    <>
      {!threads.length && (
        <p>{status === 'ALL' ? '접수된 문의가 없습니다.' : '해당 상태의 문의가 없습니다.'}</p>
      )}
      <div className="admin-inbox">
        {threads.map((thread) => (
          <SupportThreadCard key={thread.id} thread={thread} status={status} />
        ))}
      </div>
      {query.hasNextPage && (
        <Button
          type="button"
          variant="secondary"
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          문의 더 보기
        </Button>
      )}
    </>
  );
}
