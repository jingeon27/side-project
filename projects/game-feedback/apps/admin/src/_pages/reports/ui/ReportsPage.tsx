import type { TReportStatus } from '@game-feedback/contracts';

import { adminReportsPath } from '@/shared/lib';
import { AsyncBoundary } from '@/shared/ui';

import { ReportList } from './ReportList';

interface IReportStatusLinkProps {
  status: TReportStatus;
  current: TReportStatus;
  children: string;
}

function ReportStatusLink({ status, current, children }: IReportStatusLinkProps) {
  return (
    <a href={adminReportsPath(status)} aria-current={status === current ? 'page' : undefined}>
      {children}
    </a>
  );
}

export function ReportsPage({ status }: { status: TReportStatus }) {
  return (
    <section aria-label="신고함" className="form-stack">
      <h1>신고함</h1>
      <nav aria-label="신고 상태" className="admin-actions">
        <ReportStatusLink status="OPEN" current={status}>
          검토 대기
        </ReportStatusLink>
        <ReportStatusLink status="REVIEWED" current={status}>
          검토 완료
        </ReportStatusLink>
        <ReportStatusLink status="DISMISSED" current={status}>
          반려
        </ReportStatusLink>
      </nav>
      <AsyncBoundary key={status}>
        <ReportList status={status} />
      </AsyncBoundary>
    </section>
  );
}
