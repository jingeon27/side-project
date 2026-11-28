'use client';

import { useMutation } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@side/design-system/ui/button';
import { toast } from '@side/design-system/ui/sonner';

import { track } from '@/shared/analytics/browser';
import { event } from '@/shared/analytics/events';
import { findEpisode } from '@/shared/episodes';
import type { TTopic } from '@/shared/topics';

import { DeokPostcard } from './DeokPostcard';
import { saveActivity } from './device-history';

interface ICopyMessageProps {
  episode: string;
  topic: TTopic;
  message: string;
}

export function CopyMessage({ episode, topic, message }: ICopyMessageProps) {
  const form = useForm({ defaultValues: { draft: message } });
  const draft = useWatch({ control: form.control, name: 'draft' });
  const story = findEpisode(episode);
  const save = useMutation({
    mutationFn: (text: string) => saveActivity({ kind: 'message', episode, text }),
    onSuccess: (result) => {
      if (result.created) track(event.HistorySaved, { kind: 'message', location: result.location });
    },
    onError: () => toast.error('덕담을 기록에 담지 못했어요. 덕담 만들기를 다시 눌러주세요.'),
  });

  return (
    <DeokPostcard
      title={story?.title ?? '오늘의 덕담'}
      art={story?.image}
      message={draft}
      source={{ surface: 'episode', episode, topic }}
      onMessageExport={(text) => save.mutate(text)}
    >
      <div className="postcard-editor">
        <label htmlFor="message-draft">내 말투로 바꿔 보내기</label>
        <textarea id="message-draft" {...form.register('draft')} maxLength={240} rows={2} />
        <Button
          variant="secondary"
          disabled={!draft.trim()}
          loading={save.isPending}
          onClick={() => {
            track(event.MessageCreateClicked, { episode, topic });
            save.mutate(draft.trim(), {
              onSuccess: (result) =>
                toast.success(
                  result.location === 'account'
                    ? '내 기록장에 덕담을 담았어요.'
                    : '덕담을 만들었어요. 로그인하면 기록장에서 다시 볼 수 있어요.',
                ),
            });
          }}
        >
          덕담 만들기
        </Button>
      </div>
    </DeokPostcard>
  );
}
