import type { Prisma } from '../generated/prisma';
import { enqueuePush } from './push.writer';

export async function writePostNotifications(
  client: Prisma.TransactionClient,
  data: Prisma.NotificationCreateManyInput[],
) {
  if (!data.length) return;
  const rows = await client.notification.createManyAndReturn({ data });
  await enqueuePush(client, rows, 'post');
}
