import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';

import { revalidateTag } from 'next/cache';

import { CacheRevalidationSchema } from '@game-feedback/contracts';

const noStore = { 'Cache-Control': 'no-store' };

export async function revalidatePublicCache(request: Request) {
  const secret = process.env.GF_CACHE_REVALIDATION_SECRET;
  if (!secret || secret.length < 32) return Response.json({ ok: false }, { status: 503, headers: noStore });
  const digest = (value: string) => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(digest(request.headers.get('authorization') ?? ''), digest(`Bearer ${secret}`)))
    return Response.json({ ok: false }, { status: 401, headers: noStore });
  if (Number(request.headers.get('content-length')) > 16_384)
    return Response.json({ ok: false }, { status: 413, headers: noStore });
  const text = await request.text();
  if (Buffer.byteLength(text) > 16_384)
    return Response.json({ ok: false }, { status: 413, headers: noStore });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ ok: false }, { status: 400, headers: noStore });
  }
  const parsed = CacheRevalidationSchema.safeParse(body);
  if (!parsed.success) return Response.json({ ok: false }, { status: 400, headers: noStore });
  for (const tag of new Set(parsed.data.tags)) revalidateTag(tag, { expire: 0 });
  return Response.json({ ok: true }, { headers: noStore });
}
