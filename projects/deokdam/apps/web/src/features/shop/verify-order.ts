import type { OrderStore, TStoredOrder } from './order-store';
import type { fetchPayment } from './portone';

export async function verifyOrder(
  store: OrderStore,
  owner: string,
  order: TStoredOrder,
  fetchStatus: (id: string) => ReturnType<typeof fetchPayment>,
) {
  if (order.status === 'refunded') return { changed: false, order };

  const payment = await fetchStatus(order.id);
  if (!payment) return { changed: false, order };
  if (order.amount !== payment.amount.total) throw new Error('Payment amount mismatch');

  if (payment.status === 'CANCELLED') return { changed: false, order: store.markRefunded(owner, order) };
  if (payment.status === 'PAID') return store.issue(owner, order);
  return { changed: false, order };
}
