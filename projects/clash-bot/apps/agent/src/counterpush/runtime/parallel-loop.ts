import type { Episode } from '../../android/runtime/selfplay.ts';

// All actors finish under one frozen policy. The learner runs only at the
// barrier, so a finished actor cannot invalidate another actor's PPO features.
export async function parallelLearningLoop<E extends Episode>(options: {
  tabs: number;
  matches: number;
  until: number;
  signal: AbortSignal;
  stopped: () => Promise<boolean>;
  play: (tab: number) => Promise<E>;
  train: (episodes: E[]) => Promise<{ updated: boolean }>;
  returnToLobby: (tab: number) => Promise<void>;
  report: (state: Record<string, unknown>) => Promise<void>;
}) {
  const state = { completed: 0, updates: 0, rounds: 0 };
  while (
    !options.signal.aborted &&
    Date.now() < options.until &&
    (!options.matches || state.completed < options.matches)
  ) {
    if (await options.stopped()) break;
    const count = options.matches ? Math.min(options.tabs, options.matches - state.completed) : options.tabs;
    await options.report({ ...state, phase: 'playing' });
    const settled = await Promise.allSettled(Array.from({ length: count }, (_, tab) => options.play(tab)));
    options.signal.throwIfAborted();
    const verified = settled.flatMap((result, tab) =>
      result.status === 'fulfilled' && ['win', 'loss', 'draw'].includes(result.value.result)
        ? [{ tab, episode: result.value }]
        : [],
    );
    const errors = settled.flatMap((result) =>
      result.status === 'rejected'
        ? [result.reason]
        : !['win', 'loss', 'draw'].includes(result.value.result)
          ? [new Error('경기 결과가 확인되지 않았습니다.')]
          : [],
    );
    state.completed += verified.length;
    if (verified.length) {
      await options.report({ ...state, phase: 'training' });
      const training = await options.train(verified.map(({ episode }) => episode));
      if (training.updated) state.updates++;
      for (const { tab } of verified) await options.returnToLobby(tab);
      state.rounds++;
      await options.report({ ...state, phase: 'ready' });
    }
    // Preserve and train a completed sibling before surfacing a failed tab.
    // No new round starts after an unverified result or actor failure.
    if (errors.length) throw new AggregateError(errors, '일부 대전 탭이 실패해 다음 동시 대전을 멈췄습니다.');
  }
  return state;
}

export class DecisionGate {
  readonly waiting: Array<() => void> = [];
  readonly state = { held: false };
  acquire(signal: AbortSignal): Promise<() => void> {
    return new Promise((resolve, reject) => {
      const cancel = () => {
        const index = this.waiting.indexOf(grant);
        if (index >= 0) this.waiting.splice(index, 1);
        reject(signal.reason ?? new Error('추론 대기가 취소됐습니다.'));
      };
      const grant = () => {
        signal.removeEventListener('abort', cancel);
        if (signal.aborted) {
          cancel();
          this.next();
          return;
        }
        this.state.held = true;
        const lease = { released: false };
        resolve(() => {
          if (lease.released) return;
          lease.released = true;
          this.state.held = false;
          this.next();
        });
      };
      if (signal.aborted) {
        cancel();
        return;
      }
      signal.addEventListener('abort', cancel, { once: true });
      if (!this.state.held) grant();
      else this.waiting.push(grant);
    });
  }
  private next() {
    this.waiting.shift()?.();
  }
}
