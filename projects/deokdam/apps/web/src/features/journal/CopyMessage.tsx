'use client';

import { useState } from 'react';

import { Copy } from 'lucide-react';

import { Button } from '@side/design-system/ui/button';

import type { TTopic } from '@/content/topics';
import { track } from '@/shared/analytics/browser';
import { event } from '@/shared/analytics/events';

interface ICopyMessageProps {
  episode: string;
  topic: TTopic;
  message: string;
}

export function CopyMessage({ episode, topic, message }: ICopyMessageProps) {
  const [draft, setDraft] = useState(message);
  const [feedback, setFeedback] = useState('');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draft.trim());
      setFeedback('복사했어요. 원하는 곳에 붙여 넣으세요.');
      track(event.MessageCopied, { episode, topic });
    } catch {
      setFeedback('문장을 길게 눌러 복사해 주세요.');
    }
  };

  return (
    <div className="message-editor">
      <label htmlFor="message-draft">내 말투로 바꿔 보내기</label>
      <textarea
        id="message-draft"
        value={draft}
        onChange={(input) => {
          setDraft(input.target.value);
          setFeedback('');
        }}
        maxLength={240}
        rows={2}
      />
      <div className="message-buttons">
        <Button
          variant="secondary"
          icon={<Copy size={16} aria-hidden />}
          onClick={handleCopy}
          disabled={!draft.trim()}
        >
          문장 복사
        </Button>
        <span role="status" className="small-muted">
          {feedback}
        </span>
      </div>
    </div>
  );
}
