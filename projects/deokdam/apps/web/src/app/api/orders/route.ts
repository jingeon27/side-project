import { randomUUID } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { orderOwner, orderResponseHeaders, ownerCookie } from '@/features/shop/http';
import { createOrderSchema } from '@/features/shop/order-contract';
import { OrderStore, publicOrder } from '@/features/shop/order-store';
import { portOneConfig } from '@/features/shop/portone';
import { products } from '@/features/shop/products';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const config = portOneConfig();
  const owner = orderOwner(request);
  if (!config || !owner) return NextResponse.json({ orders: [] }, { headers: orderResponseHeaders });
  const store = new OrderStore(config.database);
  try {
    return NextResponse.json(
      { orders: store.list(owner).map(publicOrder) },
      { headers: orderResponseHeaders },
    );
  } finally {
    store.close();
  }
}

export async function POST(request: NextRequest) {
  const config = portOneConfig();
  if (!config) return NextResponse.json({ error: 'checkout_unavailable' }, { status: 503 });
  if (request.headers.get('origin') !== config.origin)
    return NextResponse.json({ error: 'origin' }, { status: 403 });
  const data = createOrderSchema.safeParse(await request.json().catch(() => null));
  if (!data.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  const owner = orderOwner(request) ?? randomUUID();
  const store = new OrderStore(config.database);
  try {
    const order = store.create(owner, data.data);
    const response = NextResponse.json(
      {
        order: publicOrder(order),
        checkout:
          order.status === 'pending'
            ? {
                storeId: config.storeId,
                channelKey: config.channelKey,
                paymentId: order.id,
                orderName: products[order.product].title,
                totalAmount: order.amount,
                redirectUrl: config.origin + '/shop/orders',
              }
            : null,
      },
      { headers: orderResponseHeaders },
    );
    response.cookies.set(ownerCookie(owner, config.origin));
    return response;
  } finally {
    store.close();
  }
}
