import { z } from 'zod';

import { appOrigin, currentAccount, privateJson } from '@/features/account/session';
import { withAccounts } from '@/features/account/store';
import { recordInput, recordSchema } from '@/features/journal/contract';
import { seoulToday } from '@/shared/seoul-time';

export async function GET(request: Request) {
  const account = await currentAccount();
  if (!account) return privateJson({ error: 'login_required' }, 401);
  if (new URL(request.url).searchParams.has('today')) {
    return privateJson({
      account: account.id,
      today: withAccounts((store) => store.today(account.id, seoulToday())),
    });
  }
  return privateJson(
    withAccounts((store) => ({
      account: account.id,
      records: store.records(account.id),
      activities: store.activities(account.id),
    })),
  );
}

async function write(request: Request) {
  const account = await currentAccount();
  if (!account) return privateJson({ error: 'login_required' }, 401);
  if (request.headers.get('origin') !== appOrigin(request)) return privateJson({ error: 'origin' }, 403);
  if (request.headers.get('x-deokdam-account') !== account.id)
    return privateJson({ error: 'account_changed' }, 409);
  const data: unknown = await request.json().catch(() => null);
  if (request.method === 'DELETE') {
    const archived = z
      .object({ id: z.string().regex(/^[0-9a-f]{64}$/) })
      .strict()
      .safeParse(data);
    if (archived.success) {
      withAccounts((store) => store.removeActivity(account.id, archived.data.id));
      return privateJson({ removed: true });
    }
    const date = z.object({ date: z.iso.date() }).strict().safeParse(data);
    if (!date.success) return privateJson({ error: 'invalid_input' }, 400);
    withAccounts((store) => store.remove(account.id, date.data.date));
    return privateJson({ removed: true });
  }
  const today = seoulToday();
  const input = request.method === 'PUT' ? recordSchema.safeParse(data) : recordInput.safeParse(data);
  if (!input.success) return privateJson({ error: 'invalid_input' }, 400);
  const record = recordSchema.parse({ date: today, ...input.data });
  if (record.date > today) return privateJson({ error: 'invalid_date' }, 400);
  const created = withAccounts((store) => store.save(account.id, record));
  return privateJson({ created }, created ? 201 : 200);
}

export { write as POST, write as PUT, write as DELETE };
