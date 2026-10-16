import type WebView from 'react-native-webview';

interface IWebShellSnapshot {
  readonly sourceUrl: string;
  readonly webViewKey: number;
  readonly loading: boolean;
  readonly offline: boolean;
  readonly overlayOpen: boolean;
}

export class WebViewChannel {
  private view: WebView | null = null;
  private url: string;
  private historyAvailable = false;
  private lastDocumentUrl: string;
  private readonly listeners = new Set<() => void>();
  private snapshot: IWebShellSnapshot;

  constructor(initialUrl: string) {
    this.url = initialUrl;
    this.lastDocumentUrl = initialUrl;
    this.snapshot = Object.freeze({
      sourceUrl: initialUrl,
      webViewKey: 0,
      loading: true,
      offline: false,
      overlayOpen: false,
    });
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  attach = (instance: WebView | null) => {
    this.view = instance;
  };

  finishLoading = () => {
    this.update({ loading: false });
  };

  setOverlayOpen = (overlayOpen: boolean) => {
    this.update({ overlayOpen });
  };

  startsDocument(url: string) {
    const hashOnly = url !== this.lastDocumentUrl && url.split('#')[0] === this.lastDocumentUrl.split('#')[0];
    this.lastDocumentUrl = url;
    return !hashOnly;
  }

  inject(script: string) {
    this.view?.injectJavaScript(script);
  }

  goBack() {
    this.view?.goBack();
  }

  reload() {
    this.update({ loading: true, offline: false, overlayOpen: false });
    this.view?.reload();
  }

  currentUrl() {
    return this.url;
  }

  rememberUrl(url: string) {
    this.url = url;
  }

  rememberHistory(value: boolean) {
    this.historyAvailable = value;
  }

  canGoBack() {
    return this.historyAvailable;
  }

  loadCurrentDocument() {
    this.update({ sourceUrl: this.url, loading: true, offline: false, overlayOpen: false });
  }

  recreate() {
    this.historyAvailable = false;
    this.update({
      sourceUrl: this.url,
      webViewKey: this.snapshot.webViewKey + 1,
      loading: true,
      offline: false,
      overlayOpen: false,
    });
  }

  fail() {
    this.update({ loading: false, offline: true, overlayOpen: false });
  }

  private update(patch: Partial<IWebShellSnapshot>) {
    const next = { ...this.snapshot, ...patch };
    if (
      next.sourceUrl === this.snapshot.sourceUrl &&
      next.webViewKey === this.snapshot.webViewKey &&
      next.loading === this.snapshot.loading &&
      next.offline === this.snapshot.offline &&
      next.overlayOpen === this.snapshot.overlayOpen
    ) {
      return;
    }
    this.snapshot = Object.freeze(next);
    this.listeners.forEach((listener) => listener());
  }
}
