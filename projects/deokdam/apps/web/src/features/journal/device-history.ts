'use client';

import dayjs from 'dayjs';
import { openDB, type DBSchema } from 'idb';
import { z } from 'zod';

import { seoulToday } from '@/shared/seoul-time';

import { activitySchema, type TActivity, type TActivityPage } from './activity';

interface IPending {
  owner: string;
  entry: TActivity;
}
interface IDeviceHistory extends DBSchema {
  pending: {
    key: [string, string];
    value: IPending;
    indexes: { owner: string; byDay: [string, string, string] };
  };
}
function deviceHistory() {
  return openDB<IDeviceHistory>('deokdam.unfinished-history', 1, {
    upgrade(db) {
      const pending = db.createObjectStore('pending', { keyPath: ['owner', 'entry.id'] });
      pending.createIndex('owner', 'owner');
      pending.createIndex('byDay', ['owner', 'entry.date', 'entry.page.kind']);
    },
  });
}

async function makeEntry(page: TActivityPage) {
  const date = seoulToday();
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([date, page])));
  const id = Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
  return activitySchema.parse({ id, date, createdAt: dayjs().toISOString(), page });
}

async function queue(owner: string, entry: TActivity) {
  const db = await deviceHistory();
  try {
    const tx = db.transaction('pending', 'readwrite');
    const existing =
      entry.page.kind === 'practice'
        ? await tx.store.index('byDay').getKey([owner, entry.date, 'practice'])
        : await tx.store.getKey([owner, entry.id]);
    if (!existing) await tx.store.put({ owner, entry });
    await tx.done;
    return !existing;
  } finally {
    db.close();
  }
}

async function send(account: string, entry: TActivity) {
  const response = await fetch('/api/journal/activity', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-deokdam-account': account },
    body: JSON.stringify(entry),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 401 || response.status === 409 ? 'account_changed' : 'history_unavailable',
    );
  return z.object({ created: z.boolean() }).parse(await response.json()).created;
}

async function sessionOwner() {
  const response = await fetch('/api/journal?today=1', {
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('history_unavailable');
  return z.object({ account: z.uuid() }).parse(await response.json()).account;
}

export async function saveActivity(page: TActivityPage, signedInOwner?: string) {
  const entry = await makeEntry(page);
  const account = signedInOwner ?? (await sessionOwner());
  if (!account) return { location: 'device', created: await queue('guest', entry) } as const;
  try {
    return { location: 'account', created: await send(account, entry) } as const;
  } catch (error) {
    if (error instanceof Error && error.message === 'account_changed') throw error;
    return { location: 'device', created: await queue(account, entry) } as const;
  }
}

export async function syncDeviceHistory(expected?: string) {
  const account = await sessionOwner();
  if (!account || (expected && account !== expected)) throw new Error('account_changed');
  const db = await deviceHistory();
  try {
    // One write transaction assigns each guest entry before any network I/O, including across tabs.
    const tx = db.transaction('pending', 'readwrite');
    const guests = await tx.store.index('owner').getAll('guest');
    for (const { entry } of guests) {
      await tx.store.put({ owner: account, entry });
      await tx.store.delete(['guest', entry.id]);
    }
    const pending = await tx.store.index('owner').getAll(account);
    await tx.done;
    const added: string[] = [];
    for (const { entry } of pending) {
      if (await send(account, entry)) added.push(entry.id);
      await db.delete('pending', [account, entry.id]);
    }
    return added.length;
  } finally {
    db.close();
  }
}
