import type { AppStateStatus } from 'react-native';

export interface IShellLifecycleOptions {
  openLink: (url: string) => void;
  onState: (state: 'active' | 'background') => void;
  onBack: () => Promise<boolean>;
  onFallbackBack: () => void;
}

export class ShellLifecycle {
  private readonly lifetime = new AbortController();
  private background = false;
  private pending = false;
  private receivedLink = false;

  constructor(private readonly options: IShellLifecycleOptions) {}

  openInitialLink = (url: string | null) => {
    if (this.lifetime.signal.aborted || this.receivedLink || !url) return;
    this.options.openLink(url);
  };

  openLink = ({ url }: { url: string }) => {
    if (this.lifetime.signal.aborted) return;
    this.receivedLink = true;
    this.options.openLink(url);
  };

  changeState = (next: AppStateStatus) => {
    if (this.lifetime.signal.aborted) return;
    if (next === 'background' && !this.background) {
      this.background = true;
      this.options.onState('background');
    }
    if (next === 'active' && this.background) {
      this.background = false;
      this.options.onState('active');
    }
  };

  back = () => {
    if (this.lifetime.signal.aborted || this.pending) return true;
    this.pending = true;
    void this.requestBack();
    return true;
  };

  private async requestBack() {
    try {
      const handled = await this.options.onBack();
      if (!this.lifetime.signal.aborted && !handled) this.options.onFallbackBack();
    } catch {
      if (!this.lifetime.signal.aborted) this.options.onFallbackBack();
    } finally {
      this.pending = false;
    }
  }

  dispose() {
    this.lifetime.abort();
  }
}
