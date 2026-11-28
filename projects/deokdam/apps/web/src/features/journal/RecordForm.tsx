'use client';

import Link from 'next/link';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { Button } from '@side/design-system/ui/button';
import { toast } from '@side/design-system/ui/sonner';

import { loginPath } from '@/features/account/navigation';
import { track } from '@/shared/analytics/browser';
import { event } from '@/shared/analytics/events';
import type { TTopic } from '@/shared/topics';

import { changeRecord, journalQuery, keepDraft, todayQuery } from './records';

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

  const handleSave = form.handleSubmit(async (values) => {
    const other = values.choice === 'alternative';
    const input = { topic, action: other ? alternative : action, note: values.note.trim() };
    track(event.RecordSaveClicked, { surface, topic });
    const login = () => {
      keepDraft({ ...input, alternative: other, episode });
      window.location.assign(loginPath('/journal?draft=1'));
    };
    try {
      if (journal.isError) {
        toast.error('기록장을 불러오지 못했어요. 연결을 확인해 주세요.');
        return;
      }
      if (!journal.data) {
        login();
        return;
      }
      const saved = await changeRecord(journal.data.account, 'POST', input);
      if (saved.created) track(event.DeokSaved, { topic, alternative: other, episode, surface });
      if (saved.created) toast.success('기록장에 저장했어요.');
      if (!saved.created) toast.info('오늘은 이미 덕을 남겼어요.');
      await cache.invalidateQueries({ queryKey: journalQuery.queryKey });
    } catch (error) {
      if (error instanceof Error && error.message === 'account_changed') {
        await cache.invalidateQueries({ queryKey: journalQuery.queryKey });
        toast.error('계정이 바뀌었어요. 초안을 확인하고 다시 저장해 주세요.');
        return;
      }
      toast.error('기록을 남기지 못했어요. 작성한 내용을 확인하고 다시 눌러 주세요.');
    }
  });
  if (today)
    return (
      <section className="record-success" aria-label="오늘 기록">
        <CheckCircle2 aria-hidden />
        <div>
          <strong>오늘의 덕을 남겼어요</strong>
          <p>{today.action}</p>
        </div>
        <Link href="/journal" className="plain-link">
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
      {journal.isError ? (
        <Button type="button" variant="secondary" onClick={() => journal.refetch()}>
          기록장 다시 불러오기
        </Button>
      ) : (
        <Button type="submit" disabled={journal.isPending} loading={form.formState.isSubmitting}>
          {journal.data ? '오늘 해봤어요' : '로그인하고 기록 남기기'}
        </Button>
      )}
    </form>
  );
}
