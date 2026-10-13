import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import { Database } from './database';
import { deletePhoto } from './storage';
import { captureException } from '@sentry/node';
export async function recordEvent(
  client: Prisma.TransactionClient,
  id: string,
  type: string,
  userId: string | null,
  properties: Prisma.InputJsonObject,
) {
  await client.analyticsEvent.upsert({ where: { id }, create: { id, type, userId, properties }, update: {} });
}
@Injectable()
export class AnalyticsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  constructor(private readonly db: Database) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      if (!this.running)
        this.running = this.flush()
          .catch((error) => {
            captureException(error);
          })
          .finally(() => {
            this.running = undefined;
          });
    }, 60_000);
    this.timer.unref();
  }
  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.running;
  }
  async flush() {
    const abandoned = await this.db.upload.findMany({
      where: { expiresAt: { lt: new Date(Date.now() - 5 * 60_000) }, submission: null },
      take: 100,
    });
    for (const upload of abandoned) {
      if (upload.imageKey) await deletePhoto(upload.imageKey);
      await this.db.upload.deleteMany({ where: { id: upload.id, submission: null } });
    }
    await this.db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await this.db.oAuthAttempt.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const contests = await this.db.contest.findMany({
      where: { endsAt: { lte: new Date() }, completionTrackedAt: null },
      take: 100,
    });
    for (const contest of contests) {
      await this.db.atomic(async (tx) => {
        const [submissions, votes] = await Promise.all([
          tx.submission.findMany({
            where: { contestId: contest.id, hidden: false },
            select: { authorId: true },
          }),
          tx.vote.findMany({
            where: { contestId: contest.id, submission: { hidden: false } },
            select: { voterId: true },
          }),
        ]);
        const participants = new Set([...submissions.map((s) => s.authorId), ...votes.map((v) => v.voterId)])
          .size;
        await recordEvent(tx, `completed:${contest.id}`, 'contest_completed', null, {
          contestId: contest.id,
          groupId: contest.groupId,
          submissions: submissions.length,
          votes: votes.length,
          participants,
          activeContest: participants >= 3,
        });
        await tx.contest.update({ where: { id: contest.id }, data: { completionTrackedAt: new Date() } });
      });
    }
    if (!process.env.AMPLITUDE_API_KEY) return;
    const events = await this.db.analyticsEvent.findMany({
      where: { deliveredAt: null },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });
    if (!events.length) return;
    const response = await fetch(
      process.env.AMPLITUDE_REGION === 'EU'
        ? 'https://api.eu.amplitude.com/2/httpapi'
        : 'https://api2.amplitude.com/2/httpapi',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: process.env.AMPLITUDE_API_KEY,
          events: events.map((event) => ({
            insert_id: event.id,
            event_type: event.type,
            user_id: event.userId ?? undefined,
            device_id: event.userId ? undefined : `contest:${event.id}`,
            time: event.createdAt.getTime(),
            event_properties: event.properties,
          })),
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) throw new Error(`Analytics delivery failed (${response.status})`);
    await this.db.analyticsEvent.updateMany({
      where: { id: { in: events.map((e) => e.id) } },
      data: { deliveredAt: new Date() },
    });
  }
}
