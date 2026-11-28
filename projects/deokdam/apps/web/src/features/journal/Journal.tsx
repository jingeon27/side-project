'use client';

import Link from 'next/link';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Clover, Share2 } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';

import { Button } from '@side/design-system/ui/button';
import { toast } from '@side/design-system/ui/sonner';

import { loginPath } from '@/features/account/navigation';
import { seoulToday } from '@/shared/seoul-time';
import { topics } from '@/shared/topics';

import { ActivityHistory } from './ActivityHistory';
import type { TDeokRecord } from './contract';
import { DeokPostcard } from './DeokPostcard';
import { JournalRecovery } from './JournalRecovery';
import { changeRecord, journalKey, journalQuery } from './records';

export function Journal({ account }: { account: string }) {
  const journal = useQuery(journalQuery(account));
  const cache = useQueryClient();
  const form = useForm<{ dates: string[] }>({ defaultValues: { dates: [] } });
  const selectedDates = useWatch({ control: form.control, name: 'dates' });
  const remove = useMutation({
    mutationFn: (record: TDeokRecord) => changeRecord(account, 'DELETE', { date: record.date }),
    onSuccess: async (_, record) => {
      form.setValue(
        'dates',
        form.getValues('dates').filter((date) => date !== record.date),
      );
      toast.success('기록을 지웠어요.');
      await cache.invalidateQueries({ queryKey: journalKey });
    },
    onError: () => toast.error('지우지 못했어요. 계정과 연결을 확인해 주세요.'),
  });
  if (journal.isPending) return <p role="status">기록장을 펼치고 있어요.</p>;
  if (journal.isError) return <Button onClick={() => journal.refetch()}>기록 다시 불러오기</Button>;
  if (journal.data?.account !== account)
    return (
      <a className="action-link" href={loginPath('/journal')}>
        내 계정으로 다시 열기
      </a>
    );
  const { records, activities } = journal.data;
  const recovery = (
    <>
      {journal.data.needsRetry && (
        <Button variant="secondary" loading={journal.isFetching} onClick={() => journal.refetch()}>
          이 기기의 기록 다시 동기화
        </Button>
      )}
      <JournalRecovery account={account} />
    </>
  );
  const startOfWeek = dayjs(seoulToday()).subtract(6, 'day').format('YYYY-MM-DD');
  const week = records.filter((record) => record.date >= startOfWeek && record.date <= seoulToday());
  const selected = week.filter((record) => selectedDates.includes(record.date));

  const handleDelete = (record: TDeokRecord) => {
    if (!window.confirm(record.date + ' 기록을 지울까요?')) return;
    remove.mutate(record);
  };

  if (!records.length && !activities.length) {
    return (
      <>
        {recovery}
        <div className="empty-state">
          <span className="topic-emblem">
            <Clover size={26} aria-hidden />
          </span>
          <h2>첫 번째 덕을 남겨보세요</h2>
          <p>덕담을 만들거나 사주를 읽으면 여기에 모여요. 오늘 해본 일도 함께 남겨보세요.</p>
          <Link className="action-link" href="/stories">
            오늘의 덕 고르기
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      {recovery}
      {!!records.length && (
        <section className="week-card" aria-labelledby="week-title">
          <div className="label">
            <Clover size={18} aria-hidden />
            최근 7일
          </div>
          <h2 id="week-title">{week.length}일의 덕을 남겼어요</h2>
          {!!week.length && (
            <>
              <p className="small-muted">
                공유하고 싶은 행동에만 표시하세요. 메모는 내 계정에서만 볼 수 있어요.
              </p>
              <ul className="week-select">
                {week.map((record) => (
                  <li key={record.date}>
                    <label className="choice">
                      <input type="checkbox" value={record.date} {...form.register('dates')} />
                      {record.action}
                    </label>
                  </li>
                ))}
              </ul>
              {selected.length ? (
                <DeokPostcard
                  title="이번 주의 덕"
                  message={selected.map((record) => record.action.replace(/\s+/g, ' ').trim()).join('\n')}
                  source={{ surface: 'journal' }}
                />
              ) : (
                <Button variant="secondary" disabled icon={<Share2 size={16} aria-hidden />}>
                  고른 덕 공유
                </Button>
              )}
            </>
          )}
        </section>
      )}
      <ActivityHistory account={account} entries={activities} />
      {!!records.length && (
        <section className="journal-history" aria-labelledby="history-title">
          <h2 id="history-title">내가 해본 일</h2>
          <ul className="history-list">
            {records.map((record) => (
              <li key={record.date}>
                <div>
                  <p className="label">
                    <time dateTime={record.date}>{dayjs(record.date).format('M월 D일')}</time>{' '}
                    {topics[record.topic].label}
                  </p>
                  <strong>{record.action}</strong>
                  {record.note && <p>{record.note}</p>}
                </div>
                <Button
                  variant="ghost"
                  disabled={remove.isPending}
                  onClick={() => handleDelete(record)}
                  aria-label={record.date + ' 기록 지우기'}
                >
                  지우기
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
