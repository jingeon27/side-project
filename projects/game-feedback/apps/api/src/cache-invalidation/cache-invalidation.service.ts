import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { CacheTagSchema } from '@game-feedback/contracts';
import { PrismaClient, type Prisma } from '../generated/prisma';
import { UnitOfWork } from '../database/unit-of-work';
import { APP_CONFIG, type AppConfig } from '../config/app.config';
import { reportUnexpectedError } from '../monitoring/sentry';

interface IPendingInvalidation {
  tag: string;
  revision: string;
}
type TTags<T> = readonly string[] | ((result: T) => readonly string[]);

@Injectable()
export class CacheInvalidationService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CacheInvalidationService.name);
  private timer?: ReturnType<typeof setInterval>;
  private retryAfter = 0;
  private draining?: Promise<void>;

  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UnitOfWork) private readonly transactions: UnitOfWork,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async change<T>(work: (tx: Prisma.TransactionClient) => Promise<T>, tags: TTags<NoInfer<T>>): Promise<T> {
    const committed = await this.transactions.run(async (tx) => {
      const result = await work(tx);
      const values = typeof tags === 'function' ? tags(result) : tags;
      const pending: IPendingInvalidation[] = [];
      for (const tag of [...new Set(values)].sort()) {
        CacheTagSchema.parse(tag);
        const revision = randomUUID();
        await tx.cacheInvalidation.upsert({
          where: { tag },
          create: { tag, revision },
          update: { revision },
        });
        pending.push({ tag, revision });
      }
      return { result, pending };
    });
    // Delivery happens after commit. A failed callback must not turn a successful write into an error.
    await this.deliver(committed.pending);
    return committed.result;
  }

  onApplicationBootstrap() {
    if (!this.config.cacheRevalidation) return;
    this.timer = setInterval(() => {
      void this.flushPending();
    }, 5_000);
    this.timer.unref();
    void this.flushPending();
  }

  async onApplicationShutdown() {
    clearInterval(this.timer);
    await this.draining;
  }

  async flushPending(): Promise<void> {
    if (!this.config.cacheRevalidation || this.retryAfter > Date.now()) return;
    if (this.draining) return this.draining;
    this.draining = this.drain()
      .catch(() => {
        this.failed();
      })
      .finally(() => {
        this.draining = undefined;
      });
    return this.draining;
  }

  private async drain() {
    const pending = await this.db.cacheInvalidation.findMany({
      orderBy: [{ updatedAt: 'asc' }, { tag: 'asc' }],
      take: 64,
      select: { tag: true, revision: true },
    });
    await this.deliver(pending);
  }

  private failed() {
    this.retryAfter = Date.now() + 5_000;
    this.logger.warn('Next.js cache invalidation failed; pending tags will be retried.');
    reportUnexpectedError(new Error('Next.js cache invalidation callback failed.'), {
      operation: 'cache-invalidation',
    });
  }

  private async deliver(pending: IPendingInvalidation[]) {
    const target = this.config.cacheRevalidation;
    if (!target || !pending.length || this.retryAfter > Date.now()) return;
    try {
      for (let offset = 0; offset < pending.length; offset += 64) {
        const batch = pending.slice(offset, offset + 64);
        const response = await fetch(target.url, {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(1_500),
          headers: { Authorization: `Bearer ${target.secret}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags: batch.map(({ tag }) => tag) }),
        });
        if (!response.ok) throw new Error('Cache callback rejected.');
        await response.body?.cancel();
        // Do not acknowledge a newer write that arrived while this request was in flight.
        await this.db.cacheInvalidation.deleteMany({ where: { OR: batch } });
      }
    } catch {
      this.failed();
    }
  }
}
