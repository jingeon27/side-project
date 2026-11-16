import { match, P } from 'ts-pattern';

import { BRIDGE_EVENT, parseNativeMessage, WebPathSchema } from '@game-feedback/bridge';

import { isNativeApp, NATIVE_BOOTSTRAP_EVENT, postToNative } from './native-client';

interface INativeBackResult {
  handled: boolean;
  atRoot?: boolean;
  /** back-result를 보낸 뒤에 실행할 이동. 이탈 확인 창을 띄워도 네이티브 응답이 늦지 않는다. */
  navigate?: () => void;
}
interface INativeBridgeBinding {
  path: string;
  overlayOpen: boolean;
  onOpen: (path: string) => void;
  onActive: () => void;
  /** back-result를 보낸 뒤에 부르므로 이탈 확인 창을 띄워도 된다. */
  onDismissOverlay: () => void;
  onBack: () => INativeBackResult;
}

export class NativeBridgeChannel {
  private started = false;
  private ready = false;
  private binding: INativeBridgeBinding | null = null;
  private pendingPath: string | null = null;
  private activePending = false;

  start = () => {
    if (this.started) return;
    this.started = true;
    window.addEventListener(BRIDGE_EVENT, this.handleMessage);
    window.addEventListener(NATIVE_BOOTSTRAP_EVENT, this.handleBootstrap);
  };

  stop = () => {
    if (!this.started) return;
    window.removeEventListener(BRIDGE_EVENT, this.handleMessage);
    window.removeEventListener(NATIVE_BOOTSTRAP_EVENT, this.handleBootstrap);
    this.started = false;
    this.ready = false;
    this.binding = null;
    this.pendingPath = null;
    this.activePending = false;
  };

  bind = (binding: INativeBridgeBinding) => {
    this.binding = binding;
    this.publishState();
    if (this.pendingPath) {
      const path = this.pendingPath;
      this.pendingPath = null;
      binding.onOpen(path);
    }
    if (this.activePending) {
      this.activePending = false;
      binding.onActive();
    }
    return () => {
      if (this.binding === binding) this.binding = null;
    };
  };

  private publishState() {
    if (!this.binding || !isNativeApp()) return;
    if (!this.ready) {
      this.ready = true;
      postToNative({ type: 'ready' });
    }
    const path = WebPathSchema.safeParse(this.binding.path);
    if (path.success) postToNative({ type: 'location', path: path.data });
    postToNative({ type: 'navigation-state', overlayOpen: this.binding.overlayOpen });
  }

  private handleBootstrap = () => {
    this.ready = false;
    this.publishState();
  };

  private handleBack(id: string) {
    const popup = document.querySelector(
      '[data-slot="select-content"][data-open], [data-slot="dropdown-menu-content"][data-open]',
    );
    if (popup) {
      popup.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      postToNative({ type: 'back-result', id, handled: true });
      return;
    }
    // 네이티브는 back-result를 800ms만 기다리고, 넘으면 WebView 기록 이동이나 앱 종료로 넘어간다.
    // 이탈 확인 창(window.confirm)은 답할 때까지 스크립트를 멈추므로 응답을 먼저 보내고 닫거나 이동한다.
    if (this.binding?.overlayOpen) {
      postToNative({ type: 'back-result', id, handled: true });
      this.binding.onDismissOverlay();
      return;
    }
    const { navigate, ...result }: INativeBackResult = this.binding?.onBack() ?? { handled: false };
    postToNative({ type: 'back-result', id, ...result });
    navigate?.();
  }

  private handleMessage = (event: Event) => {
    if (!isNativeApp()) return;
    const message = parseNativeMessage((event as CustomEvent<unknown>).detail);
    if (!message) return;
    match(message)
      .with({ type: 'open' }, ({ path }) => {
        if (!this.binding) {
          this.pendingPath = path;
          return;
        }
        const current = WebPathSchema.safeParse(window.location.pathname + window.location.search);
        if (!current.success || current.data !== path) this.binding.onOpen(path);
      })
      .with({ type: 'state', state: 'active' }, () => {
        if (!this.binding) {
          this.activePending = true;
          return;
        }
        this.binding.onActive();
      })
      .with({ type: 'back' }, ({ id }) => this.handleBack(id))
      // 로그인·알림 결과와 푸시 수신은 각 기능의 리스너가 따로 받는다.
      .with({ type: P.union('auth-result', 'push-result', 'push-received') }, () => undefined)
      .with({ type: 'state', state: 'background' }, () => undefined)
      .exhaustive();
  };
}

export const nativeBridgeChannel = new NativeBridgeChannel();
