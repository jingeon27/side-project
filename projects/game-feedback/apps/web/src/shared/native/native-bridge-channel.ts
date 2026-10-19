import { match } from 'ts-pattern';
import { BRIDGE_EVENT, parseNativeMessage, WebPathSchema } from '@game-feedback/bridge';
import { isNativeApp, postToNative, NATIVE_BOOTSTRAP_EVENT } from './native-client';

interface INativeBridgeBinding {
  path: string;
  overlayOpen: boolean;
  onOpen: (path: string) => void;
  onActive: () => void;
  onDismissOverlay: () => void;
  onBack: () => { handled: boolean; atRoot?: boolean };
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
    if (this.binding?.overlayOpen) {
      this.binding.onDismissOverlay();
      postToNative({ type: 'back-result', id, handled: true });
      return;
    }
    postToNative({ type: 'back-result', id, ...(this.binding?.onBack() ?? { handled: false }) });
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
      .otherwise(() => undefined);
  };
}

export const nativeBridgeChannel = new NativeBridgeChannel();
