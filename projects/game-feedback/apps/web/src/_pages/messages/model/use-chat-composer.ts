import { useRef, type BaseSyntheticEvent, type KeyboardEvent } from 'react';
import { useWatch } from 'react-hook-form';
import { z } from 'zod';
import { useSendChatMessageMutation, type IChatMessageInput } from '@/features/chat';
import { ApiError } from '@/shared/api';
import { useZodForm } from '@/shared/model/form';

const messageSchema = z.object({ body: z.string().trim().min(1).max(2000) });

interface IChatComposerOptions {
  userId: string;
  conversationId: string;
  unavailable: boolean;
  onSent: () => void;
  onUnavailable: () => Promise<unknown>;
}

export function useChatComposer({
  userId,
  conversationId,
  unavailable,
  onSent,
  onUnavailable,
}: IChatComposerOptions) {
  const form = useZodForm(messageSchema, { defaultValues: { body: '' } });
  const draft = useWatch({ control: form.control, name: 'body' });
  const mutation = useSendChatMessageMutation(userId, conversationId);
  const pendingMessage = useRef<IChatMessageInput | null>(null);

  async function handleSend({ body }: z.output<typeof messageSchema>) {
    if (mutation.isPending || unavailable) return;
    if (pendingMessage.current?.body !== body)
      pendingMessage.current = { body, clientMessageId: crypto.randomUUID() };
    try {
      await mutation.mutateAsync(pendingMessage.current);
      pendingMessage.current = null;
      form.reset({ body: '' });
      onSent();
    } catch (error) {
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) await onUnavailable();
    }
  }

  function handleSubmit(event?: BaseSyntheticEvent) {
    return form.handleSubmit(handleSend)(event);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229
    )
      return;
    event.preventDefault();
    void handleSubmit();
  }

  function handleDraftChange() {
    if (mutation.isError) mutation.reset();
  }

  return { form, draft, mutation, handleSubmit, handleKeyDown, handleDraftChange };
}
