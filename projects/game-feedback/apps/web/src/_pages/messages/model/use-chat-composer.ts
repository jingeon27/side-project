import { useEffect, type BaseSyntheticEvent, type KeyboardEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWatch } from 'react-hook-form';
import { z } from 'zod';
import {
  sendChatMessageMutationOptions,
  uploadChatAttachmentMutationOptions,
  removeChatAttachmentMutationOptions,
  discardChatAttachment,
} from '@/features/chat';
import { ApiError } from '@/shared/api';
import { useZodForm } from '@/shared/model/form';
import { useDesktopKeyboard } from './use-desktop-keyboard';

const messageSchema = z.object({ body: z.string().trim().max(2000) });

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
  const uploadOptions = uploadChatAttachmentMutationOptions(userId, conversationId);
  const upload = useMutation(uploadOptions);
  const remove = useMutation(removeChatAttachmentMutationOptions(userId, conversationId));
  const fileError = form.formState.errors.root?.attachment?.message ?? null;
  const desktopKeyboard = useDesktopKeyboard();
  const busy = mutation.isPending || upload.isPending || remove.isPending;
  useEffect(() => {
    const attachment = upload.data;
    return () => {
      if (attachment) void discardChatAttachment(conversationId, attachment.id).catch(() => {});
    };
  }, [conversationId, upload.data]);

  async function handleSend({ body }: z.output<typeof messageSchema>) {
    if (
      client.isMutating({ mutationKey: options.mutationKey, exact: true }) ||
      client.isMutating({ mutationKey: uploadOptions.mutationKey, exact: true }) ||
      remove.isPending ||
      unavailable
    )
      return;
    if (!body && !upload.data) return;
    const attachmentIds = upload.data ? [upload.data.id] : [];
    const input =
      mutation.isError &&
      mutation.variables?.body === body &&
      (mutation.variables.attachmentIds ?? []).join(',') === attachmentIds.join(',')
        ? mutation.variables
        : { body, clientMessageId: crypto.randomUUID(), ...(attachmentIds.length ? { attachmentIds } : {}) };
    try {
      await mutation.mutateAsync(input);
      form.reset({ body: '' });
      upload.reset();
      form.clearErrors('root.attachment');
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
      !desktopKeyboard ||
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
  async function handleRemoveFile() {
    if (!upload.data || busy) return;
    try {
      await remove.mutateAsync(upload.data.id);
      upload.reset();
      mutation.reset();
      form.clearErrors('root.attachment');
    } catch {
      /* The attachment remains available for retry. */
    }
  }
  async function handleFile(file?: File) {
    if (!file || busy || unavailable) return;
    if (file.size > 25 * 1024 * 1024 || file.size === 0) {
      form.setError('root.attachment', { message: '파일은 25MB 이하로 선택해주세요.' });
      return;
    }
    if (
      !['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm'].includes(file.type)
    ) {
      form.setError('root.attachment', { message: '지원하는 이미지나 동영상 파일을 선택해주세요.' });
      return;
    }
    form.clearErrors('root.attachment');
    mutation.reset();
    try {
      if (upload.data) await remove.mutateAsync(upload.data.id);
      await upload.mutateAsync(file);
    } catch (error) {
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) await onUnavailable();
    }
  }

  return {
    form,
    draft,
    mutation,
    upload,
    remove,
    fileError,
    busy,
    handleFile,
    handleRemoveFile,
    handleSubmit,
    handleKeyDown,
    handleDraftChange,
  };
}
