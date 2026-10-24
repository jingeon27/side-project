import { pushInboxPath } from './push-navigation';

/** OS 응답과 문서 준비 시점이 달라도 탭한 알림을 한 번만 연다. */
export class PushInbox {
  private pending: string | null = null;
  private readonly seen = new Set<string>();
  private open: ((path: string) => boolean) | undefined;
  private received: (() => void) | undefined;
  private consumed: (() => void) | undefined;

  bind(open: (path: string) => boolean, received: () => void) {
    this.open = open;
    this.received = received;
    this.flush();
    return () => {
      if (this.open === open) {
        this.open = undefined;
        this.received = undefined;
      }
    };
  }
  bindConsumed(consumed: () => void) {
    this.consumed = consumed;
  }
  tap(id: string, value: unknown) {
    const path = pushInboxPath(value);
    if (!path || this.seen.has(id)) return;
    this.seen.add(id);
    if (this.seen.size > 100) this.seen.delete(this.seen.values().next().value ?? '');
    this.pending = path;
    this.flush();
  }
  notify = () => this.received?.();
  flush = () => {
    if (!this.pending || !this.open?.(this.pending)) return;
    this.pending = null;
    this.consumed?.();
  };
}
