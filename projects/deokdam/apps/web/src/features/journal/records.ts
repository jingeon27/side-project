'use client';

import { z } from 'zod';

import { topicSchema } from '@/content/topics';
import { seoulToday } from '@/shared/seoul-time';

const recordSchema = z.object({
  date: z.iso.date(),
  topic: topicSchema,
  action: z.string().min(1).max(180),
  note: z.string().max(240),
});
export type TDeokRecord = z.infer<typeof recordSchema>;

const prefix = 'deokdam.journal.v1.';
const eventName = 'deokdam:journal';
const emptySnapshot = '[]';

export function readRecords(): string {
  try {
    const entries = Object.keys(localStorage)
      .filter((key) => key.startsWith(prefix))
      .map((key) => localStorage.getItem(key) ?? 'null');
    const records = entries.flatMap((raw) => {
      try {
        const result = recordSchema.safeParse(JSON.parse(raw));
        return result.success ? [result.data] : [];
      } catch {
        return [];
      }
    });
    return JSON.stringify(records.sort((first, second) => second.date.localeCompare(first.date)));
  } catch {
    return emptySnapshot;
  }
}

export function serverRecords() {
  return emptySnapshot;
}

export function subscribeRecords(callback: () => void) {
  const handleStorage = (storageEvent: StorageEvent) => {
    if (!storageEvent.key || storageEvent.key.startsWith(prefix)) callback();
  };
  window.addEventListener('storage', handleStorage);
  window.addEventListener(eventName, callback);
  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(eventName, callback);
  };
}

export function storeRecord(values: Omit<TDeokRecord, 'date'>) {
  const record = recordSchema.parse({ date: seoulToday(), ...values });
  const key = prefix + record.date;
  if (localStorage.getItem(key) && parseRecords(readRecords()).some((item) => item.date === record.date))
    return false;
  localStorage.setItem(key, JSON.stringify(record));
  window.dispatchEvent(new Event(eventName));
  return true;
}

export function deleteRecord(date: string) {
  localStorage.removeItem(prefix + z.iso.date().parse(date));
  window.dispatchEvent(new Event(eventName));
}

export function parseRecords(snapshot: string): TDeokRecord[] {
  return JSON.parse(snapshot) as TDeokRecord[];
}
