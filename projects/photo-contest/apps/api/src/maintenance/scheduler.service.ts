import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { captureException } from '@sentry/node';

import { AnalyticsDeliveryService } from '../analytics/analytics-delivery.service';
import { ContestCompletionService } from '../analytics/contest-completion.service';
import { MAINTENANCE_INTERVAL_MS } from '../config/limits';
import { MaintenanceService } from './maintenance.service';

/** 정리 → 종료 기록 → 전송을 주기마다 한 번씩, 앞선 실행과 겹치지 않게 돌린다. */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;

  constructor(
    private readonly maintenance: MaintenanceService,
    private readonly completion: ContestCompletionService,
    private readonly delivery: AnalyticsDeliveryService,
  ) {}

  onModuleInit() {
    this.start();
  }

  async onModuleDestroy() {
    this.stop();
    await this.running?.catch(() => undefined);
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.handleTick(), MAINTENANCE_INTERVAL_MS);
    // 대기 중인 타이머 때문에 프로세스가 끝나지 않는 일이 없게 한다.
    this.timer.unref();
  }

  /** 테스트처럼 주기 실행 없이 runOnce()로만 돌리고 싶을 때 쓴다. */
  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /**
   * 모든 단계를 순서대로 한 번 실행한다. 진행 중인 실행이 있으면 끝난 뒤 시작한다.
   * 한 단계가 실패해도 다음 단계는 실행하고, 끝난 뒤 처음 실패를 던진다.
   */
  runOnce(): Promise<void> {
    const previous = this.running ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => this.runSteps());
    const settled: Promise<void> = run
      .catch(() => undefined)
      .finally(() => {
        if (this.running === settled) this.running = undefined;
      });
    this.running = settled;
    return run;
  }

  private handleTick() {
    if (this.running) return;
    this.runOnce().catch((error: unknown) => captureException(error));
  }

  private async runSteps() {
    const steps = [
      () => this.maintenance.cleanup(),
      () => this.completion.recordCompletedContests(),
      () => this.delivery.deliver(),
    ];
    const failures: unknown[] = [];
    for (const step of steps) {
      try {
        await step();
      } catch (error) {
        failures.push(error);
      }
    }
    const [first, ...rest] = failures;
    for (const error of rest) captureException(error);
    if (failures.length) throw first;
  }
}
