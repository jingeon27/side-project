'use client';

import { queryOptions } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { z } from 'zod';

import { findEpisode } from '@/shared/episodes';

import { recordInput, recordSchema, type TDeokRecord } from './contract';

const responseSchema = z.object({ account: z.uuid(), records: z.array(recordSchema) });
export const journalQuery = queryOptions({
  queryKey: ['account-journal'] as const,
  queryFn: async ({ signal }) => {
    const response = await fetch('/api/journal', { signal, cache: 'no-store' });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error('journal_unavailable');
    return responseSchema.parse(await response.json());
  },
  gcTime: 0,
});

export const todayQuery = queryOptions({
  queryKey: [...journalQuery.queryKey, 'today'],
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

const draftKey = 'deokdam.login-draft';
const draftSchema = recordInput.extend({
  alternative: z.boolean(),
  episode: z
    .string()
    .refine((slug) => Boolean(findEpisode(slug)))
    .optional(),
  expires: z.number(),
});
export type TRecordDraft = Omit<z.infer<typeof draftSchema>, 'expires'>;
export function keepDraft(input: TRecordDraft) {
  sessionStorage.setItem(
    draftKey,
    JSON.stringify({ ...input, expires: dayjs().add(15, 'minute').valueOf() }),
  );
}
export function readDraft() {
  try {
    const raw = sessionStorage.getItem(draftKey);
    if (!raw) return null;
    const parsed = draftSchema.safeParse(JSON.parse(raw));
    if (parsed.success && parsed.data.expires > dayjs().valueOf()) return parsed.data;
    clearDraft();
  } catch {
    /* A disabled tab store has no draft to restore. */
  }
  return null;
}
export function clearDraft() {
  sessionStorage.removeItem(draftKey);
}
