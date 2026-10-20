import { useSuspenseQuery } from '@tanstack/react-query';
import { reportOptions } from '@/features/moderation';
import { ReportCard } from './ReportCard';

export function ReportsPage() {
  const { data: reports } = useSuspenseQuery(reportOptions());
  return (
    <section aria-label="신고함" className="form-stack">
      <h1>신고함</h1>
      {!reports.length && <p>접수된 신고가 없습니다.</p>}
      {reports.map((report) => (
        <ReportCard key={report.id} report={report} />
      ))}
    </section>
  );
}
