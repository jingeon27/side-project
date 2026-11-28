import { appOrigin, currentAccount, privateJson } from '@/features/account/session';
import { withAccounts } from '@/features/account/store';
import { activitySchema } from '@/features/journal/activity';
import { seoulToday } from '@/shared/seoul-time';

export async function POST(request: Request) {
  const account = await currentAccount();
  if (!account) return privateJson({ error: 'login_required' }, 401);
  if (request.headers.get('origin') !== appOrigin(request)) return privateJson({ error: 'origin' }, 403);
  if (request.headers.get('x-deokdam-account') !== account.id)
    return privateJson({ error: 'account_changed' }, 409);
  const input = activitySchema.safeParse(await request.json().catch(() => null));
  if (!input.success || input.data.date > seoulToday()) return privateJson({ error: 'invalid_input' }, 400);
  const created = withAccounts((store) => store.addActivity(account.id, input.data));
  return privateJson({ created }, created ? 201 : 200);
}
