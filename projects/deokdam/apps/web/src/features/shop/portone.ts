import path from 'node:path';

import { z } from 'zod';

const configSchema = z.object({
  storeId: z.string().min(1),
  channelKey: z.string().min(1),
  secret: z.string().min(1),
  database: z.string().refine(path.isAbsolute),
  origin: z.url().refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return (
      url.origin === value &&
      (url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
    );
  }),
  email: z.email(),
});

export function portOneConfig() {
  const config = configSchema.safeParse({
    storeId: process.env.DEOKDAM_PORTONE_STORE_ID?.trim(),
    channelKey: process.env.DEOKDAM_PORTONE_CHANNEL_KEY?.trim(),
    secret: process.env.DEOKDAM_PORTONE_API_SECRET?.trim(),
    database: process.env.DEOKDAM_ORDER_DB?.trim(),
    origin: process.env.DEOKDAM_PUBLIC_ORIGIN?.trim(),
    email: process.env.DEOKDAM_SUPPORT_EMAIL?.trim(),
  });
  return config.success ? config.data : undefined;
}

const providerPayment = z.object({
  id: z.string(),
  storeId: z.string(),
  status: z.string(),
  currency: z.string(),
  amount: z.object({ total: z.number().int() }),
});

export async function fetchPayment(config: NonNullable<ReturnType<typeof portOneConfig>>, paymentId: string) {
  const url = new URL('/payments/' + encodeURIComponent(paymentId), 'https://api.portone.io');
  url.searchParams.set('storeId', config.storeId);
  const response = await fetch(url, {
    headers: { authorization: 'PortOne ' + config.secret },
    signal: AbortSignal.timeout(8_000),
    cache: 'no-store',
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Payment provider unavailable');
  const payment = providerPayment.parse(await response.json());
  if (payment.id !== paymentId || payment.storeId !== config.storeId || payment.currency !== 'KRW') {
    throw new Error('Payment identity mismatch');
  }
  return payment;
}
