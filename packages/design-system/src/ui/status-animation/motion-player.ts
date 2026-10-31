import type { TMotionVariant } from './motion-assets';

interface IMotionPlayerOptions {
  variant: TMotionVariant;
  loop: boolean;
  onReady: (ready: boolean) => void;
}

function inViewport(node: HTMLElement) {
  const bounds = node.getBoundingClientRect();
  return (
    bounds.bottom > 0 &&
    bounds.top < window.innerHeight &&
    bounds.right > 0 &&
    bounds.left < window.innerWidth
  );
}

export function attachMotionPlayer(node: HTMLElement, { variant, loop, onReady }: IMotionPlayerOptions) {
  const lifetime = new AbortController();
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
        onReady(true);
        if (document.hidden || !visible) {
          player.pause();
          return;
        }
        player.play();
      };
      const handleVisibility = () => synchronize(inViewport(node));
      const handleFailure = () => {
        if (lifetime.signal.aborted) return;
        onReady(false);
        lifetime.abort();
      };
      const observer =
        typeof IntersectionObserver === 'function'
          ? new IntersectionObserver((entries) => {
              const entry = entries.find((item) => item.target === node);
              if (entry) synchronize(entry.isIntersecting);
            })
          : undefined;
      lifetime.signal.addEventListener(
        'abort',
        () => {
          observer?.disconnect();
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
      observer?.observe(node);
      handleVisibility();
    } catch {
      if (lifetime.signal.aborted) return;
      lifetime.abort();
      onReady(false);
    }
  };
  queueMicrotask(() => {
    if (!lifetime.signal.aborted) void mount();
  });
  return () => lifetime.abort();
}
