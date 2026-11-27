import { after, NextResponse, type NextRequest } from 'next/server';

import { orderOwner, orderResponseHeaders } from '@/features/shop/http';
import { orderIdSchema, orderRequestSchema } from '@/features/shop/order-contract';
import { OrderStore, publicOrder } from '@/features/shop/order-store';
import { fetchPayment, portOneConfig } from '@/features/shop/portone';
import { verifyOrder } from '@/features/shop/verify-order';
import { trackOrder } from '@/shared/analytics/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: RouteContext<'/api/orders/[id]'>) {
  const config = portOneConfig();
  if (!config) return NextResponse.json({ error: 'checkout_unavailable' }, { status: 503 });
  if (request.headers.get('origin') !== config.origin)
    return NextResponse.json({ error: 'origin' }, { status: 403 });
  const id = orderIdSchema.safeParse((await params).id);
  const data = orderRequestSchema.safeParse(await request.json().catch(() => null));
  if (!id.success || !data.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  const owner = orderOwner(request);
  if (!owner) return NextResponse.json({ error: 'order_not_found' }, { status: 404 });

  const store = new OrderStore(config.database);
  try {
    const order = store.find(owner, id.data);
    if (!order) return NextResponse.json({ error: 'order_not_found' }, { status: 404 });
    if (data.data.action === 'refund') {
      if (order.status === 'pending' || order.status === 'refunded') {
        return NextResponse.json({ error: 'order_status' }, { status: 409 });
      }
      const update = store.requestRefund(owner, order);
      if (update.changed) after(() => trackOrder(['refund_requested'], update.order));
      return NextResponse.json(publicOrder(update.order), { headers: orderResponseHeaders });
    }
    const update = await verifyOrder(store, owner, order, (paymentId) => fetchPayment(config, paymentId));
    if (update.changed) after(() => trackOrder(['purchase_verified', 'report_issued'], update.order));
    return NextResponse.json(publicOrder(update.order), { headers: orderResponseHeaders });
  } catch {
    return NextResponse.json({ error: 'verify_unavailable' }, { status: 503 });
  } finally {
    store.close();
  }
}
