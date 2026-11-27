'use client';

import { z } from 'zod';

import { checkoutResponseSchema, orderSchema } from './order-contract';

const ordersResponse = z.object({ orders: z.array(orderSchema) });

export async function readOrders(signal: AbortSignal) {
  const response = await fetch('/api/orders', { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load orders');
  return ordersResponse.parse(await response.json()).orders;
}

export async function requestCheckout(body: {
  product: string;
  adult: boolean;
  element?: string;
  deviceId?: string;
}) {
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Could not create order');
  return checkoutResponseSchema.parse(await response.json());
}

export async function updateOrder(
  id: string,
  action: 'verify' | 'refund',
  signal = AbortSignal.timeout(12_000),
) {
  const response = await fetch('/api/orders/' + id, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action }),
    signal,
  });
  if (!response.ok) throw new Error('Could not update order');
  return orderSchema.parse(await response.json());
}
