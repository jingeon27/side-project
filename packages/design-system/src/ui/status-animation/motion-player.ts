import type { TMotionVariant } from './motion-assets';

interface IMotionPlayerOptions {
  variant: TMotionVariant;
  loop: boolean;
}

export function attachMotionPlayer(node: HTMLElement, { variant, loop }: IMotionPlayerOptions) {
  const lifetime = new AbortController();
  node.removeAttribute('data-motion-ready');
  const mount = async () => {
    try {
      const [{ default: lottie }, { MOTION_ANIMATIONS }] = await Promise.all([
        import('lottie-web/build/player/lottie_light'),
        import('./motion-assets'),
      ]);
      if (lifetime.signal.aborted) return;
      const player = lottie.loadAnimation({
        container: node,
        renderer: 'svg',
        autoplay: false,
        loop,
        animationData: structuredClone(MOTION_ANIMATIONS[variant]),
        rendererSettings: { className: 'size-full', preserveAspectRatio: 'xMidYMid meet' },
      });
      const synchronize = (visible: boolean) => {
        if (lifetime.signal.aborted || !player.isLoaded) return;
        node.toggleAttribute('data-motion-ready', true);
        if (document.hidden || !visible) {
          player.pause();
          return;
        }
        player.play();
      };
      const handleVisibility = () => {
        if (lifetime.signal.aborted) return;
        const bounds = node.getBoundingClientRect();
        synchronize(
          bounds.bottom > 0 &&
            bounds.top < window.innerHeight &&
            bounds.right > 0 &&
            bounds.left < window.innerWidth,
        );
      };
      const handleFailure = () => lifetime.abort();
      lifetime.signal.addEventListener(
        'abort',
        () => {
          node.removeAttribute('data-motion-ready');
          document.removeEventListener('visibilitychange', handleVisibility);
          player.removeEventListener('DOMLoaded', handleVisibility);
          player.removeEventListener('data_failed', handleFailure);
          player.removeEventListener('error', handleFailure);
          player.destroy();
        },
        { once: true },
      );
      player.addEventListener('DOMLoaded', handleVisibility);
      player.addEventListener('data_failed', handleFailure);
      player.addEventListener('error', handleFailure);
      document.addEventListener('visibilitychange', handleVisibility);
      if (typeof IntersectionObserver === 'function') {
        const observer = new IntersectionObserver((entries) => {
          const entry = entries.find((item) => item.target === node);
          if (entry) synchronize(entry.isIntersecting);
        });
        lifetime.signal.addEventListener('abort', () => observer.disconnect(), { once: true });
        observer.observe(node);
      }
      handleVisibility();
    } catch {
      lifetime.abort();
    }
  };
  queueMicrotask(() => {
    if (!lifetime.signal.aborted) void mount();
  });
  return () => lifetime.abort();
}
