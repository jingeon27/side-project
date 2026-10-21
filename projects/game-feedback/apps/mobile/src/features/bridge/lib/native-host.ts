import {
  parseWebMessage,
  WebPathSchema,
  type TLoginProvider,
  type TLoginResult,
  type TNativeMessage,
} from '@game-feedback/bridge';

interface INativeHostOptions {
  origin: string;
  send: (message: TNativeMessage) => void;
  login: (provider: TLoginProvider) => Promise<TLoginResult>;
  onLocation: (path: string) => void;
  onReady?: () => void;
  onOverlayChange?: (open: boolean) => void;
  onRootBack?: () => void;
}
interface IPendingBack {
  id: string;
  resolve: (handled: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class NativeHost {
  private ready = false;
  private authPending = false;
  private generation = 0;
  private sequence = 0;
  private pendingBack: IPendingBack | null = null;

  constructor(private readonly options: INativeHostOptions) {}

  private finishBack(handled: boolean) {
    const pending = this.pendingBack;
    if (!pending) return;
    this.pendingBack = null;
    clearTimeout(pending.timer);
    pending.resolve(handled);
  }

  reset = () => {
    this.ready = false;
    this.generation += 1;
    this.options.onOverlayChange?.(false);
    this.finishBack(true);
  };

  receive = (data: string, sourceUrl: string) => {
    if (!(sourceUrl === this.options.origin || sourceUrl.startsWith(`${this.options.origin}/`))) return;
    const message = parseWebMessage(data);
    if (!message) return;
    if (message.type === 'ready') {
      this.ready = true;
      this.options.onReady?.();
    }
    if (message.type === 'location') this.options.onLocation(message.path);
    if (message.type === 'navigation-state') this.options.onOverlayChange?.(message.overlayOpen);
    if (message.type === 'back-result' && this.pendingBack?.id === message.id) {
      if (message.atRoot && !message.handled && this.options.onRootBack) {
        this.options.onRootBack();
        this.finishBack(true);
        return;
      }
      this.finishBack(message.handled);
    }
    if (message.type === 'auth-request') {
      if (this.authPending) {
        this.options.send({ type: 'auth-result', id: message.id, status: 'cancelled' });
        return;
      }
      this.authPending = true;
      const started = this.generation;
      void this.options
        .login(message.provider ?? 'google')
        .catch((): TLoginResult => ({ status: 'failed' }))
        .then((result) => {
          this.authPending = false;
          if (this.generation === started)
            this.options.send({ type: 'auth-result', id: message.id, ...result });
        });
    }
  };

  open = (path: string) => {
    const parsed = WebPathSchema.safeParse(path);
    if (!this.ready || !parsed.success) return false;
    this.options.send({ type: 'open', path: parsed.data });
    return true;
  };

  state = (state: 'active' | 'background') => {
    if (this.ready) this.options.send({ type: 'state', state });
  };

  back = (): Promise<boolean> => {
    if (!this.ready || this.pendingBack) return Promise.resolve(false);
    return new Promise((resolve) => {
      const id = `back-${++this.sequence}`;
      this.pendingBack = { id, resolve, timer: setTimeout(() => this.finishBack(false), 800) };
      this.options.send({ type: 'back', id });
    });
  };
}
