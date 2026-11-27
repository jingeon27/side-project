'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';

import dayjs from 'dayjs';
import { Clover, Share2 } from 'lucide-react';

import { Button } from '@side/design-system/ui/button';

import { track } from '@/shared/analytics/browser';
import { event } from '@/shared/analytics/events';
import { seoulToday } from '@/shared/seoul-time';
import { topics } from '@/shared/topics';

import {
  deleteRecord,
  parseRecords,
  readRecords,
  serverRecords,
  subscribeRecords,
  type TDeokRecord,
} from './records';

export function Journal() {
  const snapshot = useSyncExternalStore(subscribeRecords, readRecords, serverRecords);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const records = parseRecords(snapshot);
  const startOfWeek = dayjs(seoulToday()).subtract(6, 'day').format('YYYY-MM-DD');
  const week = records.filter((record) => record.date >= startOfWeek && record.date <= seoulToday());
  const selected = week.filter((record) => selectedDates.includes(record.date));

  const handleShare = async () => {
    const message = ['덕담집에서 남긴 이번 주의 덕', ...selected.map((record) => record.action)].join('\n');
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ text: message });
        track(event.JournalShared, { method: 'share' });
        return;
      }
      await navigator.clipboard.writeText(message);
      setStatus('고른 행동을 복사했어요.');
      track(event.JournalShared, { method: 'copy' });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setStatus('공유하지 못했어요. 다시 시도해 주세요.');
    }
  };

  const handleDelete = (record: TDeokRecord) => {
    if (!window.confirm(record.date + ' 기록을 지울까요?')) return;
    try {
      deleteRecord(record.date);
      setSelectedDates((dates) => dates.filter((date) => date !== record.date));
      setStatus('기록을 지웠어요.');
    } catch {
      setStatus('기록을 지우지 못했어요. 다시 시도해 주세요.');
    }
  };

  if (!records.length) {
    return (
      <div className="empty-state">
        <span className="topic-emblem">
          <Clover size={26} aria-hidden />
        </span>
        <h2>첫 번째 덕을 남겨보세요</h2>
        <p>오늘 해본 일을 적으면 여기에 모여요.</p>
        <Link className="action-link" href="/#stories">
          오늘의 덕 고르기
        </Link>
        <p role="status" className="small-muted">
          {status}
        </p>
      </div>
    );
  }

  return (
    <>
      <section className="week-card" aria-labelledby="week-title">
        <div className="label">
          <Clover size={18} aria-hidden />
          최근 7일
        </div>
        <h2 id="week-title">{week.length}일의 덕을 남겼어요</h2>
        {!!week.length && (
          <>
            <p className="small-muted">
              공유하고 싶은 행동에만 표시하세요. 여기에 남긴 메모는 기기에 보관돼요.
            </p>
            <ul className="week-select">
              {week.map((record) => (
                <li key={record.date}>
                  <label className="choice">
                    <input
                      type="checkbox"
                      checked={selectedDates.includes(record.date)}
                      onChange={(input) => {
                        setSelectedDates((dates) =>
                          input.target.checked
                            ? [...dates, record.date]
                            : dates.filter((date) => date !== record.date),
                        );
                      }}
                    />
                    {record.action}
                  </label>
                </li>
              ))}
            </ul>
            <Button
              variant="secondary"
              disabled={!selected.length}
              onClick={handleShare}
              icon={<Share2 size={16} aria-hidden />}
            >
              고른 덕 공유
            </Button>
          </>
        )}
        <p role="status" className="small-muted">
          {status}
        </p>
      </section>
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
                onClick={() => handleDelete(record)}
                aria-label={record.date + ' 기록 지우기'}
              >
                지우기
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
