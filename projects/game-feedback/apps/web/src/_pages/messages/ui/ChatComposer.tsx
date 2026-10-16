import { LoaderCircle, Send } from 'lucide-react';
import { chatError } from '@/features/chat';
import { useChatComposer } from '../model/use-chat-composer';

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
  const { form, draft, mutation, handleSubmit, handleKeyDown, handleDraftChange } = useChatComposer({
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
          <span>읽음 상태를 동기화하지 못했어요.</span>
          <button className="text-button" onClick={onRetryRead}>
            다시 시도
          </button>
        </div>
      )}
      {mutation.isError && (
        <div className="chat-send-error" role="alert">
          {chatError(mutation.error)}
          <span>작성한 내용은 그대로 남아 있어요.</span>
        </div>
      )}
      <form className="chat-compose" onSubmit={handleSubmit}>
        <textarea
          {...form.register('body', { onChange: handleDraftChange })}
          aria-label="메시지 내용"
          placeholder="플레이 이야기를 나눠보세요"
          rows={2}
          maxLength={2000}
          disabled={mutation.isPending}
          onKeyDown={handleKeyDown}
        />
        <button
          className="button dark"
          type="submit"
          disabled={mutation.isPending || !draft.trim()}
          aria-label={mutation.isError ? '다시 보내기' : '보내기'}
        >
          {mutation.isPending ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}
        </button>
      </form>
      <div className="chat-compose-hint">
        <span>Enter로 보내기 · Shift + Enter로 줄바꿈</span>
        <span>{draft.length.toLocaleString()} / 2,000</span>
      </div>
    </div>
  );
}
