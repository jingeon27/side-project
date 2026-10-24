import { chunk } from 'es-toolkit';

import type { TDatabaseClient } from '../database/database.service';

/** 알림과 같은 트랜잭션에 기록해 커밋 뒤 프로세스가 종료되어도 전송할 항목을 잃지 않는다. */
export async function enqueuePush(
  client: TDatabaseClient,
  rows: { id: string; userId: string }[],
  kind = 'notification',
) {
  if (!rows.length) return;
  const devices = await client.pushDevice.findMany({
    where: {
      userId: { in: rows.map((row) => row.userId) },
      enabled: true,
      session: { expiresAt: { gt: new Date() } },
    },
    select: { id: true, userId: true },
  });
  const data = rows.flatMap((row) =>
    devices
      .filter((device) => device.userId === row.userId)
      .map((device) => ({ deviceId: device.id, eventId: `${kind}:${row.id}` })),
  );
  for (const batch of chunk(data, 500))
    await client.pushDelivery.createMany({ data: batch, skipDuplicates: true });
}
