import { useQueryClient, useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { uniqBy } from 'es-toolkit';

import { Button } from '@side/design-system';

import { UserVerificationControls } from '@/features/moderation';
import { messageOptions, threadOptions, type TSupportThread } from '@/features/support';
import { formatDateTime } from '@/shared/lib';

import { SupportReplyForm } from './SupportReplyForm';

export function SupportConversation({ thread }: { thread: TSupportThread }) {
  const client = useQueryClient();
  const query = useSuspenseInfiniteQuery(messageOptions(thread.conversationId));
  const messages = uniqBy(
    query.data.pages.flatMap((page) => page.items),
    (message) => message.id,
  ).reverse();
  function handleVerified() {
    return client.invalidateQueries(threadOptions());
  }
  return (
    <section className="admin-card form-stack" aria-label="문의 대화">
      <h2>{thread.requester.nickname} 문의</h2>
      <p className="muted">게임 태그: {thread.requester.supercellTag ?? '미등록'}</p>
      <UserVerificationControls user={thread.requester} onVerified={handleVerified} />
      {query.hasNextPage && (
        <Button
          type="button"
          variant="secondary"
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          이전 메시지
        </Button>
      )}
      <div role="log" aria-label="문의 메시지" className="admin-messages">
        {messages.map((message) => (
          <article key={message.id} className="admin-message">
            <strong>{message.sender.nickname}</strong>
            <p>{message.body}</p>
            {message.attachments?.map((file) => (
              <a key={file.id} href={file.url} target="_blank" rel="noopener noreferrer">
                {file.kind === 'IMAGE' ? '사진 보기' : '동영상 보기'}
              </a>
            ))}
            <time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time>
          </article>
        ))}
      </div>
      <SupportReplyForm conversationId={thread.conversationId} />
    </section>
  );
}
