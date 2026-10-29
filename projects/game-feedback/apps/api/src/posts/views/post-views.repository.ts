import type { PrismaClient } from '../../generated/prisma';

/** 24시간 중복 방지 창보다 긴 48시간을 보관한다. 누적 조회수는 Post에 따로 남는다. */
export const POST_VIEW_RETENTION_MS = 48 * 60 * 60 * 1000;
export const POST_VIEW_PRUNE_BATCH_SIZE = 1000;

export async function prunePostViews({
  client,
  now = new Date(),
  batchSize = POST_VIEW_PRUNE_BATCH_SIZE,
}: {
  client: PrismaClient;
  now?: Date;
  batchSize?: number;
}) {
  const cutoff = new Date(now.getTime() - POST_VIEW_RETENTION_MS);
  return client.$executeRaw`
    WITH expired AS (
      SELECT "postId", "visitorHash" FROM "PostView"
      WHERE "lastViewedAt" < ${cutoff}
      ORDER BY "lastViewedAt", "postId", "visitorHash"
      LIMIT ${batchSize} FOR UPDATE SKIP LOCKED
    )
    DELETE FROM "PostView" AS v USING expired AS e
    WHERE v."postId" = e."postId" AND v."visitorHash" = e."visitorHash"
  `;
}
