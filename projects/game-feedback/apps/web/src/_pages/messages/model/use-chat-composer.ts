import type { BaseSyntheticEvent, KeyboardEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWatch } from 'react-hook-form';
import { z } from 'zod';
import { sendChatMessageMutationOptions } from '@/features/chat';
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
  const client = useQueryClient();
  const options = sendChatMessageMutationOptions(client, userId, conversationId);
  const mutation = useMutation(options);

  async function handleSend({ body }: z.output<typeof messageSchema>) {
    if (client.isMutating({ mutationKey: options.mutationKey, exact: true }) || unavailable) return;
    const input =
      mutation.isError && mutation.variables?.body === body
        ? mutation.variables
        : { body, clientMessageId: crypto.randomUUID() };
    try {
      await mutation.mutateAsync(input);
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
