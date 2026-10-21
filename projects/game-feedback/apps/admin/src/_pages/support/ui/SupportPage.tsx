import { useSuspenseQuery } from '@tanstack/react-query';

import { threadOptions } from '@/features/support';
import { AsyncBoundary } from '@/shared/ui';
import { SupportConversation } from '@/widgets/support-conversation';

import { SupportThreadCard } from './SupportThreadCard';

export function SupportPage({ threadId }: { threadId: string }) {
  const { data: threads } = useSuspenseQuery(threadOptions());
  const selected = threads.find((thread) => thread.id === threadId);
  return (
    <section aria-label="문의함" className="form-stack">
      <h1>문의함</h1>
      {!threads.length && <p>접수된 문의가 없습니다.</p>}
      <div className="admin-inbox">
        {threads.map((thread) => (
          <SupportThreadCard key={thread.id} thread={thread} />
        ))}
      </div>
      {selected && (
        <AsyncBoundary key={selected.id}>
          <SupportConversation thread={selected} />
        </AsyncBoundary>
      )}
    </section>
  );
}
