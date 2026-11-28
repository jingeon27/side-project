'use client';

import Link from 'next/link';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { Button } from '@side/design-system/ui/button';
import { toast } from '@side/design-system/ui/sonner';

import { track } from '@/shared/analytics/browser';
import { event } from '@/shared/analytics/events';
import type { TTopic } from '@/shared/topics';

import { saveActivity } from './device-history';
import { journalQuery, todayQuery } from './records';

interface IRecordFormProps {
  action: string;
  alternative: string;
  topic: TTopic;
  episode?: string;
}
export function RecordForm({ action, alternative, topic, episode }: IRecordFormProps) {
  const journal = useQuery(todayQuery);
  const cache = useQueryClient();
  const form = useForm({ defaultValues: { choice: 'main', note: '' } });
  const today = journal.data?.today;
  const surface = episode ? 'episode' : 'reading';

  const save = useMutation({
    mutationFn: (input: { choice: string; note: string }) =>
      saveActivity(
        {
          kind: 'practice',
          topic,
          action: input.choice === 'alternative' ? alternative : action,
          note: input.note.trim(),
        },
        journal.data?.account,
      ),
    onSuccess: async (saved, input) => {
      if (saved.created)
        track(event.DeokSaved, {
          topic,
          alternative: input.choice === 'alternative',
          episode,
          surface,
          location: saved.location,
        });
      if (!saved.created) toast.info('이미 남긴 기록이에요.');
      if (saved.location === 'account') await cache.invalidateQueries({ queryKey: journalQuery.queryKey });
    },
    onError: () => toast.error('저장하지 못했어요. 작성한 내용은 그대로 두었어요.'),
  });
  const handleSave = form.handleSubmit(async (values) => {
    track(event.RecordSaveClicked, { surface, topic });
    await save.mutateAsync(values).catch(() => undefined);
  });
  if (today || save.isSuccess)
    return (
      <section className="record-success" aria-label="오늘 기록">
        <CheckCircle2 aria-hidden />
        <div>
          <strong>오늘의 덕을 남겼어요</strong>
          <p>
            {today?.action ??
              (save.data?.location === 'device'
                ? '이 기기에 보관했어요. 로그인하면 내 기록장에서 이어볼 수 있어요.'
                : '내 기록장에서 다시 볼 수 있어요.')}
          </p>
        </div>
        <Link
          href="/journal"
          className="plain-link"
          onClick={() => track(event.HistoryOpenClicked, { surface })}
        >
          기록장 보기
        </Link>
      </section>
    );
  return (
    <form className="record-form" onSubmit={handleSave}>
      <fieldset>
        <legend>오늘 해본 일</legend>
        <label className="choice">
          <input type="radio" value="main" {...form.register('choice')} />
          {action}
        </label>
        <label className="choice">
          <input type="radio" value="alternative" {...form.register('choice')} />
          {alternative}
        </label>
      </fieldset>
      <label className="field-label" htmlFor="record-note">
        남기고 싶은 한 줄 <span>선택</span>
      </label>
      <textarea
        id="record-note"
        rows={2}
        maxLength={240}
        placeholder="해보고 어땠나요?"
        {...form.register('note')}
      />
      <Button type="submit" loading={form.formState.isSubmitting}>
        오늘 해봤어요
      </Button>
    </form>
  );
}
