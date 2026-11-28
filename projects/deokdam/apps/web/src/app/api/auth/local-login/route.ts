import type { NextRequest } from 'next/server';

import { localAccountSchema, localLoginEnabled, loopbackOrigin } from '@/features/account/local-login';
import { returnPath } from '@/features/account/navigation';
import { privateJson, signedInResponse } from '@/features/account/session';

export function GET() {
  return privateJson({ error: 'not_found' }, 404);
}

export async function POST(request: NextRequest) {
  const origin = loopbackOrigin(request.headers);
  if (!origin || !localLoginEnabled(request.headers)) return GET();
  if (request.headers.get('origin') !== origin) return privateJson({ error: 'origin' }, 403);
  const form = await request.formData().catch(() => null);
  const account = localAccountSchema.safeParse(form?.get('account'));
  if (!account.success) return privateJson({ error: 'invalid_account' }, 400);
  return signedInResponse(request, origin, returnPath(form?.get('next')), 'local', 'fixture-' + account.data);
}
