import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Button } from '@side/design-system';
import { threadOptions, statusMutationOptions } from '@/features/support';
import { adminUserPath } from '@/shared/lib';
import { AsyncBoundary, ErrorNotice } from '@/shared/ui';
import { SupportConversation } from './SupportConversation';
export function SupportInbox({ threadId }: { threadId: string }) {
  const { data: threads } = useSuspenseQuery(threadOptions());
  const client = useQueryClient();
  const mutation = useMutation(statusMutationOptions(client));
  const selected = threads.find((thread) => thread.id === threadId);
  return (
    <section aria-label="문의함" className="form-stack">
      <h1>문의함</h1>
      {!threads.length && <p>접수된 문의가 없습니다.</p>}
      <div className="admin-inbox">
        {threads.map((thread) => (
          <article key={thread.id} className="admin-card form-stack" data-thread-id={thread.id}>
            <h2>{thread.requester.nickname}</h2>
            <p>
              {thread.topic === 'VERIFICATION' ? '프로필 인증 문의' : '관리자 문의'} /{' '}
              {thread.status === 'OPEN' ? '상담 중' : '처리 완료'}
            </p>
            <div className="admin-actions">
              <a href={`#support?thread=${thread.id}`}>문의 채팅 열기</a>
              <a href={adminUserPath(thread.requester.id)}>사용자 관리</a>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({ id: thread.id, status: thread.status === 'OPEN' ? 'CLOSED' : 'OPEN' })
              }
            >
              {thread.status === 'OPEN' ? '문의 처리 완료' : '문의 다시 열기'}
            </Button>
          </article>
        ))}
      </div>
      <ErrorNotice error={mutation.error} />
      {selected && (
        <AsyncBoundary key={selected.id}>
          <SupportConversation thread={selected} />
        </AsyncBoundary>
      )}
    </section>
  );
}
