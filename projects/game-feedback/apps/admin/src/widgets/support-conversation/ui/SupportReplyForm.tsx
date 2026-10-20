import { Button, Textarea } from '@side/design-system';
import { useSupportReplyMutation } from '@/features/support';
import { useZodForm } from '@/shared/model';
import { ErrorNotice } from '@/shared/ui';
import { supportReplySchema } from '../model/support-reply.schema';

export function SupportReplyForm({ conversationId }: { conversationId: string }) {
  const send = useSupportReplyMutation(conversationId);
  const form = useZodForm(supportReplySchema, { defaultValues: { body: '' } });
  const handleSend = form.handleSubmit(async ({ body }) => {
    const clientMessageId =
      (send.isError || send.isPending) && send.variables?.body === body
        ? send.variables.clientMessageId
        : crypto.randomUUID();
    try {
      await send.mutateAsync({ conversationId, body, clientMessageId });
      form.reset();
    } catch {
      // Keep the draft and retry UUID until the server accepts this reply.
    }
  });
  return (
    <form className="form-stack" onSubmit={handleSend}>
      <label>
        답변 내용
        <Textarea
          {...form.register('body')}
          placeholder="문의에 답변하세요."
          rows={3}
          aria-invalid={Boolean(form.formState.errors.body)}
          maxLength={2000}
        />
      </label>
      {form.formState.errors.body && <p role="alert">답변을 입력해주세요.</p>}
      <Button type="submit" disabled={send.isPending}>
        답변 보내기
      </Button>
      <ErrorNotice error={send.error} />
    </form>
  );
}
