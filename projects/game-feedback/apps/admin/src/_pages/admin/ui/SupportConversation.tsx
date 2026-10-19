import { useMutation, useQueryClient, useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { Button, Textarea } from '@side/design-system';
import { z } from 'zod';
import { messageOptions, replyMutationOptions, type TSupportThread } from '@/features/support';
import { useZodForm } from '@/shared/model';
import { ErrorNotice } from '@/shared/ui';
import { formatDateTime } from '@/shared/lib';
const replySchema = z.object({ body: z.string().trim().min(1).max(2000) });
export function SupportConversation({ thread }: { thread: TSupportThread }) {
  const client = useQueryClient();
  const query = useSuspenseInfiniteQuery(messageOptions(thread.conversationId));
  const send = useMutation(replyMutationOptions(client, thread.conversationId));
  const form = useZodForm(replySchema, { defaultValues: { body: '' } });
  const messages = [
    ...new Map(
      query.data.pages.flatMap((page) => page.items).map((message) => [message.id, message]),
    ).values(),
  ].reverse();
  const handleSend = form.handleSubmit(async ({ body }) => {
    const clientMessageId =
      (send.isError || send.isPending) && send.variables?.body === body
        ? send.variables.clientMessageId
        : crypto.randomUUID();
    try {
      await send.mutateAsync({ conversationId: thread.conversationId, body, clientMessageId });
      form.reset();
    } catch {
      /* Keep the draft and retry UUID. */
    }
  });
  return (
    <section className="admin-card form-stack" aria-label="문의 대화">
      <h2>{thread.requester.nickname} 문의</h2>
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
              <a key={file.id} href={file.url} target="_blank" rel="noreferrer">
                {file.kind === 'IMAGE' ? '사진 보기' : '동영상 보기'}
              </a>
            ))}
            <time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time>
          </article>
        ))}
      </div>
      <form className="form-stack" onSubmit={handleSend}>
        <label>
          답변 내용
          <Textarea {...form.register('body')} placeholder="문의에 답변하세요." rows={3} />
        </label>
        {form.formState.errors.body && <p role="alert">답변을 입력해주세요.</p>}
        <Button type="submit" disabled={send.isPending}>
          답변 보내기
        </Button>
        <ErrorNotice error={send.error} />
      </form>
    </section>
  );
}
