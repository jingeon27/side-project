import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OrderStore, publicOrder } from './order-store';
import { verifyOrder } from './verify-order';

describe('report orders', () => {
  const owner = 'browser-owner';
  const product = { product: 'job-week', adult: true, element: 'metal' } as const;
  const fixture: { store?: OrderStore } = {};

  beforeEach(() => {
    fixture.store = new OrderStore(':memory:');
  });
  afterEach(() => {
    fixture.store?.close();
  });

  function store() {
    if (!fixture.store) throw new Error('Order store not initialized');
    return fixture.store;
  }

  it('retains the order on retry and scopes each order to its buyer', () => {
    const created = store().create(owner, product);
    expect(store().create(owner, product).id).toBe(created.id);
    expect(store().find('another-browser', created.id)).toBeUndefined();
    expect(publicOrder(created).report).toBeNull();
    expect(publicOrder(created)).not.toHaveProperty('element');
  });

  it('grants one seven-day report after real payment status, verifies repeat calls, and handles refund requests', async () => {
    const order = store().create(owner, product);
    const mockPayment = async () => ({
      id: order.id,
      status: 'PAID',
      amount: { total: 4900 },
      currency: 'KRW',
      storeId: 'test',
    });
    const duplicateRequests = await Promise.all([
      verifyOrder(store(), owner, order, mockPayment),
      verifyOrder(store(), owner, order, mockPayment),
    ]);
    expect(duplicateRequests.filter((result) => result.changed)).toHaveLength(1);
    expect(duplicateRequests.map(({ order: result }) => publicOrder(result).report?.cards.length)).toEqual([
      7, 7,
    ]);
    expect(publicOrder(duplicateRequests[0].order).report?.intro).toContain('금(金)');
    expect(store().requestRefund(owner, order).changed).toBe(true);
    expect(store().requestRefund(owner, order).changed).toBe(false);
    const cancellation = await verifyOrder(store(), owner, order, async () => ({
      ...(await mockPayment()),
      status: 'CANCELLED',
    }));
    expect(publicOrder(cancellation.order)).toMatchObject({ status: 'refunded', report: null });
    expect(store().create(owner, product).id).not.toBe(order.id);
  });

  it('keeps an order recoverable after a missing payment or amount mismatch', async () => {
    const order = store().create(owner, product);
    expect((await verifyOrder(store(), owner, order, async () => null)).order.status).toBe('pending');
    await expect(
      verifyOrder(store(), owner, order, async () => ({
        id: order.id,
        status: 'PAID',
        amount: { total: 49 },
        currency: 'KRW',
        storeId: 'test',
      })),
    ).rejects.toThrow('Payment amount mismatch');
    expect(store().find(owner, order.id)?.status).toBe('pending');
  });
});
