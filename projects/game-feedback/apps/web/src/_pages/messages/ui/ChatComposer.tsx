'use client';

import { LoaderCircle, Paperclip, Send, X } from 'lucide-react';

import { Textarea } from '@side/design-system';

import { chatError } from '@/features/chat';
import { useI18n } from '@/shared/i18n';
import { mediaAccept } from '@/shared/lib/media-types';
import { MotionButton } from '@/shared/ui';

import { useChatComposer } from '../model/use-chat-composer';
import { ChatAttachmentView } from './ChatAttachmentView';

interface IChatComposerProps {
  userId: string;
  conversationId: string;
  unavailable: boolean;
  readFailed: boolean;
  onRetryRead: () => void;
  onSent: () => void;
  onUnavailable: () => Promise<unknown>;
}

export function ChatComposer({
  userId,
  conversationId,
  unavailable,
  readFailed,
  onRetryRead,
  onSent,
  onUnavailable,
}: IChatComposerProps) {
  const { t } = useI18n();
  const {
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
  } = useChatComposer({
    userId,
    conversationId,
    unavailable,
    onSent,
    onUnavailable,
  });
  return (
    <div className="chat-compose-area">
      {readFailed && (
        <div className="chat-read-error">
          <span>{t('읽음 상태를 동기화하지 못했어요.')}</span>
          <button className="text-action" onClick={onRetryRead}>
            {t('다시 시도')}
          </button>
        </div>
      )}
      {mutation.isError && (
        <div className="chat-send-error" role="alert">
          {chatError(mutation.error)}
          <span>{t('작성한 내용은 그대로 남아 있어요.')}</span>
        </div>
      )}
      {Boolean(fileError || upload.error || remove.error) && (
        <p role="alert" className="chat-send-error">
          {fileError ? t(fileError) : t(chatError(upload.error ?? remove.error))}
        </p>
      )}
      {upload.data && (
        <div className="chat-attachment-preview">
          <ChatAttachmentView attachment={upload.data} />
          <span>{upload.data.name}</span>
          <button
            type="button"
            className="icon-button"
            disabled={busy}
            onClick={handleRemoveFile}
            aria-label={t('첨부파일 제거')}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <form className="chat-compose" onSubmit={handleSubmit}>
        <label
          className={`chat-attach-button${busy ? ' disabled' : ''}`}
          title={t('이미지 또는 동영상 첨부')}
        >
          {upload.isPending ? <LoaderCircle size={20} className="spin" /> : <Paperclip size={20} />}
          <input
            type="file"
            accept={mediaAccept.all}
            aria-label={t('이미지 또는 동영상 첨부')}
            disabled={busy || unavailable}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              void handleFile(file);
            }}
          />
        </label>
        <Textarea
          className="min-h-touch max-h-28 w-0 flex-1 resize-none rounded-none border-0 px-0 py-2 leading-6 shadow-none focus-visible:border-transparent focus-visible:ring-0"
          {...form.register('body', { onChange: handleDraftChange })}
          aria-label={t('메시지 내용')}
          placeholder={t('플레이 이야기를 나눠보세요')}
          rows={1}
          maxLength={2000}
          disabled={mutation.isPending}
          onKeyDown={handleKeyDown}
        />
        <MotionButton
          variant="primary"
          size="icon"
          type="submit"
          disabled={busy || unavailable || (!draft.trim() && !upload.data)}
          aria-label={mutation.isError ? t('다시 보내기') : t('보내기')}
        >
          {mutation.isPending ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}
        </MotionButton>
      </form>
      {draft.length >= 1800 && <p className="chat-compose-count">{draft.length.toLocaleString()} / 2,000</p>}
    </div>
  );
}
