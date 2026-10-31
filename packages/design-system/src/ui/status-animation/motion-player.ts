import type { AnimationItem } from 'lottie-web';

import type { TMotionVariant } from './motion-assets';

interface IMotionPlayerOptions {
  variant: TMotionVariant;
  loop: boolean;
  onReady: (ready: boolean) => void;
}

export class StatusAnimationPlayer {
  private player?: AnimationItem;
  private observer?: IntersectionObserver;
  private started = false;
  private disposed = false;

  constructor(
    private readonly node: HTMLElement,
    private readonly options: IMotionPlayerOptions,
  ) {}

  start() {
    if (this.started || this.disposed) return;
    this.started = true;
    queueMicrotask(() => {
      if (!this.disposed) void this.mount();
    });
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.observer?.disconnect();
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.player?.removeEventListener('DOMLoaded', this.handleVisibility);
    this.player?.removeEventListener('data_failed', this.handleFailure);
    this.player?.removeEventListener('error', this.handleFailure);
    this.player?.destroy();
    this.observer = undefined;
    this.player = undefined;
  }

  private async mount() {
    try {
      const [{ default: lottie }, { MOTION_ANIMATIONS }] = await Promise.all([
        import('lottie-web/build/player/lottie_light'),
        import('./motion-assets'),
      ]);
      if (this.disposed) return;
      this.player = lottie.loadAnimation({
        container: this.node,
        renderer: 'svg',
        autoplay: false,
        loop: this.options.loop,
        animationData: structuredClone(MOTION_ANIMATIONS[this.options.variant]),
        rendererSettings: { className: 'size-full', preserveAspectRatio: 'xMidYMid meet' },
      });
      this.player.addEventListener('DOMLoaded', this.handleVisibility);
      this.player.addEventListener('data_failed', this.handleFailure);
      this.player.addEventListener('error', this.handleFailure);
      document.addEventListener('visibilitychange', this.handleVisibility);
      if (typeof IntersectionObserver === 'function')
        this.observer = new IntersectionObserver(this.handleIntersection);
      this.observer?.observe(this.node);
      this.handleVisibility();
    } catch {
      this.handleFailure();
    }
  }

  private synchronize(visible: boolean) {
    const player = this.player;
    if (this.disposed || !player?.isLoaded) return;
    this.options.onReady(true);
    if (document.hidden || !visible) {
      player.pause();
      return;
    }
    player.play();
  }

  private readonly handleVisibility = () => {
    if (this.disposed) return;
    const bounds = this.node.getBoundingClientRect();
    this.synchronize(
      bounds.bottom > 0 &&
        bounds.top < window.innerHeight &&
        bounds.right > 0 &&
        bounds.left < window.innerWidth,
    );
  };

  private readonly handleIntersection = (entries: IntersectionObserverEntry[]) => {
    const entry = entries.find((item) => item.target === this.node);
    if (entry) this.synchronize(entry.isIntersecting);
  };

  private readonly handleFailure = () => {
    if (this.disposed) return;
    this.options.onReady(false);
    this.destroy();
  };
}
