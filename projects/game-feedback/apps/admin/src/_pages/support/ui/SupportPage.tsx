import { adminSupportListPath, type TSupportStatusFilter } from '@/shared/lib';
import { AsyncBoundary } from '@/shared/ui';

import { SelectedSupportThread } from './SelectedSupportThread';
import { SupportThreadList } from './SupportThreadList';

interface ISupportStatusLinkProps {
  status: TSupportStatusFilter;
  current: TSupportStatusFilter;
  children: string;
  currentHash: string;
}

function SupportStatusLink({ status, current, children, currentHash }: ISupportStatusLinkProps) {
  return (
    <a
      href={adminSupportListPath(status, currentHash)}
      aria-current={status === current ? 'page' : undefined}
    >
      {children}
    </a>
  );
}

interface ISupportPageProps {
  threadId: string;
  currentHash: string;
  status: TSupportStatusFilter;
}

export function SupportPage({ threadId, status, currentHash }: ISupportPageProps) {
  return (
    <section aria-label="문의함" className="form-stack">
      <h1>문의함</h1>
      <nav aria-label="문의 상태" className="admin-actions">
        <SupportStatusLink status="ALL" current={status} currentHash={currentHash}>
          전체
        </SupportStatusLink>
        <SupportStatusLink status="OPEN" current={status} currentHash={currentHash}>
          상담 중
        </SupportStatusLink>
        <SupportStatusLink status="CLOSED" current={status} currentHash={currentHash}>
          처리 완료
        </SupportStatusLink>
      </nav>
      <AsyncBoundary key={status}>
        <SupportThreadList status={status} />
      </AsyncBoundary>
      {threadId && (
        <AsyncBoundary key={threadId}>
          <SelectedSupportThread id={threadId} />
        </AsyncBoundary>
      )}
    </section>
  );
}
