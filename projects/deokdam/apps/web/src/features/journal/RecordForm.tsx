'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';

import { CheckCircle2 } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { Button } from '@side/design-system/ui/button';

import { track } from '@/shared/analytics/browser';
import { event } from '@/shared/analytics/events';
import { seoulToday } from '@/shared/seoul-time';
import type { TTopic } from '@/shared/topics';

import { parseRecords, readRecords, serverRecords, storeRecord, subscribeRecords } from './records';

interface IRecordFormProps {
  action: string;
  alternative: string;
  topic: TTopic;
  episode?: string;
}

interface IFormValues {
  choice: 'main' | 'alternative';
  note: string;
}

export function RecordForm({ action, alternative, topic, episode }: IRecordFormProps) {
  const snapshot = useSyncExternalStore(subscribeRecords, readRecords, serverRecords);
  const [error, setError] = useState('');
  const form = useForm<IFormValues>({ defaultValues: { choice: 'main', note: '' } });
  const today = parseRecords(snapshot).find((record) => record.date === seoulToday());

  const handleSave = (values: IFormValues) => {
    setError('');
    const isAlternative = values.choice === 'alternative';
    try {
      const created = storeRecord({
        topic,
        action: isAlternative ? alternative : action,
        note: values.note.trim(),
      });
      if (created)
        track(event.DeokSaved, {
          topic,
          alternative: isAlternative,
          episode,
          surface: episode ? 'episode' : 'reading',
        });
    } catch {
      setError('저장할 수 없어요. 브라우저의 저장 설정을 확인하고 다시 눌러 주세요.');
    }
  };

  if (today) {
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
  }

  return (
    <form className="record-form" onSubmit={form.handleSubmit(handleSave)}>
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
      <Button type="submit">오늘 해봤어요</Button>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </form>
  );
}
