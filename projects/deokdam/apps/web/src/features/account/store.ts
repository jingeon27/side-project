import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { z } from 'zod';

import { recordSchema, type TDeokRecord } from '@/features/journal/contract';

import { providerSchema, type TProvider } from './navigation';

export const sessionSeconds = 30 * 24 * 60 * 60;
export const flowSeconds = 600;
const flowSchema = z.object({ next: z.string(), verifier: z.string(), nonce: z.string() });
const digest = (value: string) => createHash('sha256').update(value).digest('base64url');
const token = () => randomBytes(32).toString('base64url');
const initialize = `
  PRAGMA busy_timeout = 5000;
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY, provider TEXT NOT NULL, subject TEXT NOT NULL, UNIQUE(provider, subject)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    hash TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES accounts(id), expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS login_flows (
    state TEXT PRIMARY KEY, binding TEXT NOT NULL, provider TEXT NOT NULL, next TEXT NOT NULL,
    verifier TEXT NOT NULL, nonce TEXT NOT NULL, expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS journal (
    owner TEXT NOT NULL REFERENCES accounts(id), date TEXT NOT NULL, topic TEXT NOT NULL,
    action TEXT NOT NULL, note TEXT NOT NULL, PRIMARY KEY(owner, date)
  );
`;

export class AccountStore {
  private readonly db: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(file);
    this.db.exec(initialize);
  }

  close() {
    this.db.close();
  }

  begin(provider: TProvider, next: string) {
    this.db.prepare('DELETE FROM login_flows WHERE expires <= unixepoch()').run();
    const flow = { binding: token(), state: token(), verifier: token(), nonce: token() };
    this.db
      .prepare('INSERT INTO login_flows VALUES (?, ?, ?, ?, ?, ?, unixepoch() + ?)')
      .run(digest(flow.state), digest(flow.binding), provider, next, flow.verifier, flow.nonce, flowSeconds);
    return flow;
  }

  consume(provider: TProvider, state: string, binding: string) {
    const row = this.db
      .prepare(
        'DELETE FROM login_flows WHERE state=? AND binding=? AND provider=? AND expires > unixepoch() RETURNING next,verifier,nonce',
      )
      .get(digest(state), digest(binding), provider);
    return row ? flowSchema.parse(row) : undefined;
  }

  signIn(provider: TProvider, subject: string) {
    const row = this.db
      .prepare(
        'INSERT INTO accounts VALUES (?,?,?) ON CONFLICT(provider,subject) DO UPDATE SET subject=excluded.subject RETURNING id',
      )
      .get(randomUUID(), provider, subject);
    const owner = z.uuid().parse(row?.id);
    const session = token();
    this.db.prepare('DELETE FROM sessions WHERE expires <= unixepoch()').run();
    this.db
      .prepare('INSERT INTO sessions VALUES (?,?,unixepoch()+?)')
      .run(digest(session), owner, sessionSeconds);
    return { owner, session };
  }

  account(session: string) {
    const row = this.db
      .prepare(
        'SELECT a.id, a.provider FROM accounts a JOIN sessions s ON a.id=s.owner WHERE s.hash=? AND s.expires > unixepoch()',
      )
      .get(digest(session));
    return row ? z.object({ id: z.uuid(), provider: providerSchema }).parse(row) : null;
  }

  signOut(session: string) {
    this.db.prepare('DELETE FROM sessions WHERE hash=?').run(digest(session));
  }

  today(owner: string, date: string) {
    const row = this.db.prepare('SELECT action FROM journal WHERE owner=? AND date=?').get(owner, date);
    return row ? z.object({ action: z.string() }).parse(row) : null;
  }

  records(owner: string) {
    return this.db
      .prepare('SELECT date,topic,action,note FROM journal WHERE owner=? ORDER BY date DESC')
      .all(owner)
      .map((row) => recordSchema.parse(row));
  }

  save(owner: string, record: TDeokRecord) {
    return Boolean(
      this.db
        .prepare(
          'INSERT INTO journal(owner,date,topic,action,note) VALUES(?,?,?,?,?) ON CONFLICT(owner,date) DO NOTHING',
        )
        .run(owner, record.date, record.topic, record.action, record.note).changes,
    );
  }

  remove(owner: string, date: string) {
    return Boolean(this.db.prepare('DELETE FROM journal WHERE owner=? AND date=?').run(owner, date).changes);
  }
}

export function withAccounts<T>(run: (store: AccountStore) => T): T {
  const store = new AccountStore(process.env.DEOKDAM_ACCOUNT_DB || path.resolve('.data/accounts.sqlite'));
  try {
    return run(store);
  } finally {
    store.close();
  }
}
