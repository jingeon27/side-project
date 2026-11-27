import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import dayjs from 'dayjs';
import { z } from 'zod';

import { elementSchema } from '@/features/reading/contracts';

import { createOrderSchema, orderSchema } from './order-contract';
import { products, reportIntro, reportPrice } from './products';

const storedOrder = orderSchema.omit({ report: true }).extend({
  reportJson: z.string().nullable(),
  element: elementSchema.nullable(),
  deviceId: z.string().nullable(),
});

const databaseSchema = [
  'CREATE TABLE IF NOT EXISTS orders (',
  'id TEXT PRIMARY KEY, owner TEXT NOT NULL, product TEXT NOT NULL,',
  'amount INTEGER NOT NULL, element TEXT, device_id TEXT, status TEXT NOT NULL,',
  'created_at TEXT NOT NULL, report_json TEXT, refund_requested_at TEXT);',
  "CREATE UNIQUE INDEX IF NOT EXISTS orders_active_product ON orders(owner, product) WHERE status <> 'refunded';",
].join(' ');
const select =
  'SELECT id, product, amount, element, device_id AS deviceId, status, created_at AS createdAt, report_json AS reportJson FROM orders';

export type TStoredOrder = z.infer<typeof storedOrder>;

export function publicOrder(order: TStoredOrder) {
  return orderSchema.parse({
    ...order,
    report:
      order.status === 'issued' || order.status === 'refund_requested'
        ? JSON.parse(order.reportJson ?? 'null')
        : null,
  });
}

export class OrderStore {
  private readonly db: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA busy_timeout = 3000; PRAGMA journal_mode = WAL;');
    this.db.exec(databaseSchema);
  }

  close() {
    this.db.close();
  }

  list(owner: string) {
    return this.db
      .prepare(select + ' WHERE owner = ? ORDER BY created_at DESC')
      .all(owner)
      .map((row) => storedOrder.parse(row));
  }

  find(owner: string, id: string) {
    const order = this.db.prepare(select + ' WHERE owner = ? AND id = ?').get(owner, id);
    return order ? storedOrder.parse(order) : undefined;
  }

  create(owner: string, input: z.infer<typeof createOrderSchema>) {
    const id = 'dw-' + randomUUID().replaceAll('-', '');
    this.db
      .prepare(
        [
          'INSERT INTO orders (id, owner, product, amount, element, device_id, status, created_at)',
          "VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
          "ON CONFLICT(owner, product) WHERE status <> 'refunded' DO NOTHING",
        ].join(' '),
      )
      .run(
        id,
        owner,
        input.product,
        reportPrice,
        input.element ?? null,
        input.deviceId ?? null,
        dayjs().toISOString(),
      );
    return storedOrder.parse(
      this.db
        .prepare(select + " WHERE owner = ? AND product = ? AND status <> 'refunded'")
        .get(owner, input.product),
    );
  }

  issue(owner: string, order: TStoredOrder) {
    const report = {
      intro: reportIntro(order.product, order.element ?? undefined),
      cards: products[order.product].cards,
    };
    const written = this.db
      .prepare(
        "UPDATE orders SET status = 'issued', report_json = ? WHERE id = ? AND owner = ? AND status = 'pending'",
      )
      .run(JSON.stringify(report), order.id, owner);
    return { changed: Boolean(written.changes), order: this.find(owner, order.id) ?? order };
  }

  markRefunded(owner: string, order: TStoredOrder) {
    this.db
      .prepare("UPDATE orders SET status = 'refunded', report_json = NULL WHERE id = ? AND owner = ?")
      .run(order.id, owner);
    return this.find(owner, order.id) ?? order;
  }

  requestRefund(owner: string, order: TStoredOrder) {
    const written = this.db
      .prepare(
        "UPDATE orders SET status = 'refund_requested', refund_requested_at = ? WHERE id = ? AND owner = ? AND status = 'issued'",
      )
      .run(dayjs().toISOString(), order.id, owner);
    return { changed: Boolean(written.changes), order: this.find(owner, order.id) ?? order };
  }
}
