'use client';

import Link from 'next/link';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Button } from '@side/design-system/ui/button';
import { toast } from '@side/design-system/ui/sonner';

import { elementDescriptions } from '@/features/reading/interpretation';
import { track } from '@/shared/analytics/browser';
import { event } from '@/shared/analytics/events';
import { episodePath, findEpisode } from '@/shared/episodes';
import { topics } from '@/shared/topics';

import type { TActivity, TActivityPage } from './activity';
import { changeRecord, journalQuery } from './records';

const sectionNames = {
  message: '만든 덕담',
  reading: '받은 풀이',
  practice: '같은 날에 더 해본 일',
} as const;

function ArchiveEntry({ page }: { page: TActivityPage }) {
  if (page.kind === 'message') {
    const episode = findEpisode(page.episode);
    return (
      <>
        <p className="archive-message">{page.text}</p>
        {episode && (
          <Link className="plain-link archive-source" href={episodePath(episode.slug)}>
            {episode.title}
          </Link>
        )}
      </>
    );
  }
  if (page.kind === 'practice')
    return (
      <>
        <strong>{page.action}</strong>
        {page.note && <p>{page.note}</p>}
      </>
    );
  const concern = topics[page.topic].concerns.find((item) => item.id === page.concern)?.label;
  const reading = page.reading;
  return (
    <details
      className="archive-reading"
      onToggle={(change) => {
        if (change.currentTarget.open)
          track(event.ArchivedReadingOpened, { topic: page.topic, mode: reading.mode });
      }}
    >
      <summary>{concern ?? topics[page.topic].label}</summary>
      <div>
        <p className="label">
          {topics[page.topic].label} · {elementDescriptions[page.element].label} ·{' '}
          {reading.mode === 'ai' ? 'AI 풀이' : '기본 풀이'}
        </p>
        <p>{reading.interpretation}</p>
        {reading.example && (
          <p>
            <strong>이렇게 해보세요</strong>
            <br />
            {reading.example}
          </p>
        )}
        {reading.action && (
          <p>
            <strong>오늘의 덕</strong>
            <br />
            {reading.action}
          </p>
        )}
        {!!reading.sources?.length && (
          <p className="small-muted">
            참고 자료 · {reading.sources.map((source) => source.title).join(', ')}
          </p>
        )}
      </div>
    </details>
  );
}
export function ActivityHistory({ account, entries }: { account: string; entries: TActivity[] }) {
  const cache = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => changeRecord(account, 'DELETE', { id }),
    onSuccess: async () => {
      toast.success('기록을 지웠어요.');
      await cache.invalidateQueries({ queryKey: journalQuery.queryKey });
    },
    onError: () => toast.error('지우지 못했어요. 계정과 연결을 확인해 주세요.'),
  });
  return (['message', 'reading', 'practice'] as const).map((kind) => {
    const items = entries.filter((entry) => entry.page.kind === kind);
    if (!items.length) return null;
    return (
      <section key={kind} className="journal-history" aria-labelledby={'archive-' + kind}>
        <h2 id={'archive-' + kind}>{sectionNames[kind]}</h2>
        <ul className="history-list">
          {items.map((entry) => (
            <li key={entry.id}>
              <div className="archive-entry">
                <time className="label" dateTime={entry.date}>
                  {dayjs(entry.date).format('YYYY년 M월 D일')}
                </time>
                <ArchiveEntry page={entry.page} />
              </div>
              <Button
                variant="ghost"
                disabled={remove.isPending}
                aria-label={sectionNames[kind] + ' 기록 지우기'}
                onClick={() => {
                  if (window.confirm('이 기록을 지울까요?')) remove.mutate(entry.id);
                }}
              >
                지우기
              </Button>
            </li>
          ))}
        </ul>
      </section>
    );
  });
}
