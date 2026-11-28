'use client';

import { useForm, useWatch } from 'react-hook-form';

import { findEpisode } from '@/shared/episodes';
import type { TTopic } from '@/shared/topics';

import { DeokPostcard } from './DeokPostcard';

interface ICopyMessageProps {
  episode: string;
  topic: TTopic;
  message: string;
}

export function CopyMessage({ episode, topic, message }: ICopyMessageProps) {
  const form = useForm({ defaultValues: { draft: message } });
  const draft = useWatch({ control: form.control, name: 'draft' });
  const story = findEpisode(episode);

  return (
    <DeokPostcard
      title={story?.title ?? '오늘의 덕담'}
      art={story?.image}
      message={draft}
      source={{ surface: 'episode', episode, topic }}
    >
      <div className="postcard-editor">
        <label htmlFor="message-draft">내 말투로 바꿔 보내기</label>
        <textarea id="message-draft" {...form.register('draft')} maxLength={240} rows={2} />
      </div>
    </DeokPostcard>
  );
}
