import { z } from 'zod';

import { findEpisode } from '@/shared/episodes';
import { topicSchema } from '@/shared/topics';

export const providerSchema = z.enum(['google', 'kakao']);
export type TProvider = z.infer<typeof providerSchema>;
export const accountProviderSchema = z.enum([...providerSchema.options, 'local']);
export type TAccountProvider = z.infer<typeof accountProviderSchema>;
export const providerNames = { google: 'Google', kakao: '카카오', local: '로컬 테스트' } satisfies Record<
  TAccountProvider,
  string
>;

export function returnPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || /[\\\s#]/.test(value)) return '/journal';
  const base = 'https://deokdam.bambyul.com';
  const url = URL.parse(value, base);
  if (!url || url.origin !== base) return '/journal';
  if (url.pathname === '/shop/orders') {
    const id = url.searchParams.get('paymentId');
    return id && /^dw-[a-f\d]{32}$/.test(id) ? '/shop/orders?paymentId=' + id : '/shop/orders';
  }
  if (url.pathname === '/shop' || url.pathname === '/reading') {
    const topic = topicSchema.safeParse(url.searchParams.get('topic'));
    return url.pathname + (topic.success ? '?topic=' + topic.data : '');
  }
  if (url.pathname.startsWith('/cards/') && findEpisode(url.pathname.slice(7))) return url.pathname;
  return '/journal';
}

export function loginPath(next: string) {
  return '/login?' + new URLSearchParams({ next: returnPath(next) });
}
