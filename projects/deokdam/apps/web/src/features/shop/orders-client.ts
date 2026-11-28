'use client';

import { z } from 'zod';

import { checkoutResponseSchema, orderSchema } from './order-contract';

const ordersResponse = z.object({ orders: z.array(orderSchema) });

export async function readOrders(account: string, signal: AbortSignal) {
  const response = await fetch('/api/orders', {
    signal,
    cache: 'no-store',
    headers: { 'x-deokdam-account': account },
  });
  if (response.status === 401 || response.status === 412) throw new Error('login_required');
  if (!response.ok) throw new Error('Could not load orders');
  return ordersResponse.parse(await response.json()).orders;
}

export async function requestCheckout(
  account: string,
  body: {
    product: string;
    adult: boolean;
    element?: string;
    deviceId?: string;
  },
) {
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-deokdam-account': account },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 401 || response.status === 412) throw new Error('login_required');
  if (!response.ok) throw new Error('Could not create order');
  return checkoutResponseSchema.parse(await response.json());
}

export async function updateOrder(
  account: string,
  id: string,
  action: 'verify' | 'refund',
  signal = AbortSignal.timeout(12_000),
) {
  const response = await fetch('/api/orders/' + id, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-deokdam-account': account },
    body: JSON.stringify({ action }),
    signal,
  });
  if (response.status === 401 || response.status === 412) throw new Error('login_required');
  if (!response.ok) throw new Error('Could not update order');
  return orderSchema.parse(await response.json());
}
