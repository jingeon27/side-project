import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { uniqBy } from 'es-toolkit';

import type { TReportStatus } from '@game-feedback/contracts';
import { Button } from '@side/design-system';

import { reportOptions } from '@/features/moderation';

import { ReportCard } from './ReportCard';

export function ReportList({ status }: { status: TReportStatus }) {
  const query = useSuspenseInfiniteQuery(reportOptions(status));
  const reports = uniqBy(
    query.data.pages.flatMap((page) => page.items),
    (report) => report.id,
  );
  return (
    <>
      {!reports.length && <p>해당 상태의 신고가 없습니다.</p>}
      {reports.map((report) => (
        <ReportCard key={report.id} report={report} />
      ))}
      {query.hasNextPage && (
        <Button
          type="button"
          variant="secondary"
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          신고 더 보기
        </Button>
      )}
    </>
  );
}
