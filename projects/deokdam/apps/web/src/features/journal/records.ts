'use client';

import { queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

import { track } from '@/shared/analytics/browser';
import { event } from '@/shared/analytics/events';

import { activitySchema } from './activity';
import { recordSchema, type TDeokRecord } from './contract';
import { syncDeviceHistory } from './device-history';

const responseSchema = z.object({
  account: z.uuid(),
  records: z.array(recordSchema),
  activities: z.array(activitySchema),
});
export const journalKey = ['account-journal'] as const;
export function journalQuery(account: string) {
  return queryOptions({
    queryKey: [...journalKey, account],
    queryFn: async ({ signal }) => {
      const sync = await syncDeviceHistory(account).then(
        (count) => ({ count, needsRetry: false }),
        () => ({ count: 0, needsRetry: true }),
      );
      if (sync.count) track(event.JournalImported, { count: sync.count });
      const response = await fetch('/api/journal', {
        signal,
        cache: 'no-store',
        headers: { 'x-deokdam-account': account },
      });
      if (response.status === 401 || response.status === 409) return null;
      if (!response.ok) throw new Error('journal_unavailable');
      const history = responseSchema.parse(await response.json());
      return { ...history, needsRetry: sync.needsRetry };
    },
    gcTime: 0,
  });
}

export const todayQuery = queryOptions({
  queryKey: [...journalKey, 'today'],
  queryFn: async ({ signal }) => {
    const response = await fetch('/api/journal?today=1', { signal, cache: 'no-store' });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error('journal_unavailable');
    return z
      .object({ account: z.uuid(), today: z.object({ action: z.string() }).nullable() })
      .parse(await response.json());
  },
  gcTime: 0,
});

export async function changeRecord(account: string, method: 'POST' | 'PUT' | 'DELETE', data: unknown) {
  const response = await fetch('/api/journal', {
    method,
    headers: { 'content-type': 'application/json', 'x-deokdam-account': account },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(12000),
  });
  if (response.status === 401 || response.status === 409) throw new Error('account_changed');
  if (!response.ok) throw new Error('journal_unavailable');
  return z.object({ created: z.boolean().optional() }).parse(await response.json());
}

const prefix = 'deokdam.journal.v1.';
export function legacyRecords() {
  try {
    return Object.keys(localStorage)
      .filter((key) => key.startsWith(prefix))
      .flatMap((key) => {
        try {
          const parsed = recordSchema.safeParse(JSON.parse(localStorage.getItem(key) ?? 'null'));
          return parsed.success && key === prefix + parsed.data.date ? [parsed.data] : [];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

export function forgetImported(record: TDeokRecord) {
  const key = prefix + record.date;
  const raw = localStorage.getItem(key);
  if (!raw) return;
  const existing = recordSchema.safeParse(JSON.parse(raw));
  if (existing.success && JSON.stringify(existing.data) === JSON.stringify(record))
    localStorage.removeItem(key);
}
