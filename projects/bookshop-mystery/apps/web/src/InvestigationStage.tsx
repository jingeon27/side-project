import { useEffect, useRef, useState, type PointerEvent } from 'react';

import { trackEvent } from './analytics';
import { front, type IOrientation, type TProp, type TRenderer } from './case-file';

interface IScenePlayer {
  renderer: TRenderer;
  draw: (view: TProp, pose: IOrientation) => void;
  dispose: () => void;
}

interface IInvestigationStage {
  view: TProp;
  orientation: IOrientation;
  onRotate: (x: number, y: number) => void;
  onRenderer: (renderer: TRenderer | null) => void;
}

async function showWebgl(canvas: HTMLCanvasElement, host: HTMLElement) {
  const { createDeskRenderer } = await import('./desk-renderer');
  const webgl = await createDeskRenderer(canvas, { interactive: true });
  const displayed = { view: 'desk' as TProp, pose: front };
  const resize = () => {
    webgl.resize(
      Math.max(host.clientWidth, 1),
      Math.max(host.clientHeight, 1),
      Math.min(window.devicePixelRatio, 1.5),
    );
    webgl.draw(displayed.view, displayed.pose);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  return {
    renderer: 'webgl' as const,
    draw: (view: TProp, pose: IOrientation) => {
      displayed.view = view;
      displayed.pose = pose;
      webgl.draw(view, pose);
    },
    dispose: () => {
      observer.disconnect();
      webgl.dispose();
    },
  };
}

function photoFor(view: TProp, underside: boolean) {
  const name = view.startsWith('printer') && underside ? view + '-back' : view;
  return '/assets/' + name + '.webp';
}

export function InvestigationStage({ view, orientation, onRotate, onRenderer }: IInvestigationStage) {
  const hostRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const [player, setPlayer] = useState<IScenePlayer | null>(null);
  const [photo, setPhoto] = useState(false);
  const engaged = view !== 'desk';

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    onRenderer(null);
    const controller = new AbortController();
    const started = performance.now();
    const loadingDeadline = setTimeout(() => controller.abort(), 8_000);
    const state: { player?: IScenePlayer; closed?: boolean } = {};

    async function load() {
      if (!host) return;
      const unityCanvas = document.createElement('canvas');
      host.append(unityCanvas);
      const { loadUnityPlayer } = await import('./unity-player');
      const unity = await loadUnityPlayer(unityCanvas, controller.signal).catch(() => null);
      clearTimeout(loadingDeadline);
      if (state.closed) {
        unity?.dispose();
        return;
      }
      if (unity) {
        state.player = unity;
      } else {
        unityCanvas.remove();
        const browserCanvas = document.createElement('canvas');
        host.append(browserCanvas);
        const webgl = await showWebgl(browserCanvas, host).catch(() => null);
        if (state.closed) {
          webgl?.dispose();
          return;
        }
        if (webgl) state.player = webgl;
        if (!webgl) browserCanvas.remove();
      }
      const renderer = state.player?.renderer ?? 'photo';
      void trackEvent('case_scene_loaded', {
        renderer,
        load_bucket: performance.now() - started < 8_000 ? 'under_8s' : '8s_or_more',
      });
      setPlayer(state.player ?? null);
      setPhoto(renderer === 'photo');
      onRenderer(renderer);
    }

    void load();
    return () => {
      state.closed = true;
      controller.abort();
      clearTimeout(loadingDeadline);
      state.player?.dispose();
      host.replaceChildren();
    };
  }, [onRenderer]);

  useEffect(() => {
    player?.draw(view, orientation);
  }, [player, view, orientation]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!engaged || !player || event.button !== 0) return;
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const previous = pointer.current;
    if (!previous || previous.id !== event.pointerId) return;
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    onRotate((event.clientX - previous.x) * 0.7, (event.clientY - previous.y) * 0.55);
  };

  return (
    <div className="stage" data-renderer={player?.renderer ?? (photo ? 'photo' : 'loading')}>
      <img
        className="scene-photo"
        src={photoFor(view, orientation.underside)}
        alt=""
        fetchPriority={view === 'desk' ? 'high' : 'auto'}
      />
      <div
        className="scene-canvas"
        ref={hostRef}
        data-active={Boolean(player)}
        data-engaged={engaged}
        aria-hidden="true"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => {
          pointer.current = null;
        }}
        onPointerCancel={() => {
          pointer.current = null;
        }}
        onLostPointerCapture={() => {
          pointer.current = null;
        }}
      />
      <div className="stage-vignette" />
    </div>
  );
}
