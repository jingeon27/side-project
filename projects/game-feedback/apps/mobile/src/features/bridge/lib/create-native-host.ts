import {
  parseWebMessage,
  WebPathSchema,
  type TLoginResult,
  type TNativeMessage,
  type TLoginProvider,
} from '@game-feedback/bridge';

interface IHostOptions {
  origin: string;
  send: (message: TNativeMessage) => void;
  login: (provider: TLoginProvider) => Promise<TLoginResult>;
  onLocation: (path: string) => void;
  onReady?: () => void;
  onOverlayChange?: (open: boolean) => void;
  onRootBack?: () => void;
}
export function createNativeHost(options: IHostOptions) {
  let ready = false;
  let authPending = false;
  let generation = 0;
  let sequence = 0;
  let back: { id: string; resolve: (handled: boolean) => void; timer: ReturnType<typeof setTimeout> } | null =
    null;
  function finishBack(handled: boolean) {
    if (!back) return;
    clearTimeout(back.timer);
    back.resolve(handled);
    back = null;
  }
  return {
    reset() {
      ready = false;
      generation += 1;
      options.onOverlayChange?.(false);
      finishBack(true);
    },
    receive(data: string, sourceUrl: string) {
      if (!(sourceUrl === options.origin || sourceUrl.startsWith(`${options.origin}/`))) return;
      const message = parseWebMessage(data);
      if (!message) return;
      if (message.type === 'ready') {
        ready = true;
        options.onReady?.();
      }
      if (message.type === 'location') options.onLocation(message.path);
      if (message.type === 'navigation-state') options.onOverlayChange?.(message.overlayOpen);
      if (message.type === 'back-result' && back?.id === message.id) {
        if (message.atRoot && !message.handled && options.onRootBack) {
          options.onRootBack();
          finishBack(true);
          return;
        }
        finishBack(message.handled);
      }
      if (message.type === 'auth-request') {
        if (authPending) {
          options.send({ type: 'auth-result', id: message.id, status: 'cancelled' });
          return;
        }
        authPending = true;
        const started = generation;
        void options
          .login(message.provider ?? 'google')
          .catch((): TLoginResult => ({ status: 'failed' }))
          .then((result) => {
            authPending = false;
            if (generation === started) options.send({ type: 'auth-result', id: message.id, ...result });
          });
      }
    },
    open(path: string) {
      const parsed = WebPathSchema.safeParse(path);
      if (!ready || !parsed.success) return false;
      options.send({ type: 'open', path: parsed.data });
      return true;
    },
    state(state: 'active' | 'background') {
      if (ready) options.send({ type: 'state', state });
    },
    back(): Promise<boolean> {
      if (!ready || back) return Promise.resolve(false);
      return new Promise((resolve) => {
        const id = `back-${++sequence}`;
        back = { id, resolve, timer: setTimeout(() => finishBack(false), 800) };
        options.send({ type: 'back', id });
      });
    },
  };
}
