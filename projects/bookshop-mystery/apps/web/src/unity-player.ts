import type { IOrientation, TProp } from './case-file';

interface IUnityManifest {
  loader: string;
  data: string;
  framework: string;
  code: string;
}

interface IUnity {
  SendMessage: (target: string, action: string, value: string) => void;
  Quit: () => Promise<void>;
}

interface IUnityWindow extends Window {
  createUnityInstance?: (
    canvas: HTMLCanvasElement,
    config: { dataUrl: string; frameworkUrl: string; codeUrl: string; devicePixelRatio: number },
  ) => Promise<IUnity>;
}

const folder = '/unity/';

function isUnityManifest(value: Partial<IUnityManifest> | null): value is IUnityManifest {
  return Boolean(
    value &&
    [value.loader, value.data, value.framework, value.code].every(
      (path) => typeof path === 'string' && /^Build\/[^/]+$/.test(path),
    ),
  );
}

export async function loadUnityPlayer(canvas: HTMLCanvasElement, signal: AbortSignal) {
  const response = await fetch(folder + 'viewer.json', { signal });
  if (!response.ok || !response.headers.get('content-type')?.includes('json')) return null;
  const manifest: Partial<IUnityManifest> | null = await response.json();
  if (!isUnityManifest(manifest)) return null;

  const script = document.createElement('script');
  script.src = folder + manifest.loader;
  try {
    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Unity 로더를 불러오지 못했습니다.'));
      document.head.append(script);
    });

    const globals: IUnityWindow = window;
    if (!globals.createUnityInstance) return null;
    const status: { instance?: IUnity } = {};
    const stageReady = new Promise<void>((resolve, reject) => {
      window.addEventListener('bookshop-unity-ready', () => resolve(), { once: true, signal });
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    const loading = globals.createUnityInstance(canvas, {
      dataUrl: folder + manifest.data,
      frameworkUrl: folder + manifest.framework,
      codeUrl: folder + manifest.code,
      devicePixelRatio: Math.min(window.devicePixelRatio, 1.5),
    });
    async function awaitInstance() {
      const instance = await loading;
      if (signal.aborted) {
        await instance.Quit();
        throw signal.reason;
      }
      status.instance = instance;
      return instance;
    }

    try {
      const [instance] = await Promise.all([awaitInstance(), stageReady]);
      const displayed: { view?: TProp } = {};
      return {
        renderer: 'unity' as const,
        draw: (view: TProp, pose: IOrientation) => {
          if (displayed.view !== view) instance.SendMessage('Investigation', 'ShowEvidence', view);
          displayed.view = view;
          instance.SendMessage(
            'Investigation',
            'OrientEvidence',
            [pose.yaw, pose.pitch, pose.underside ? 1 : 0].join(','),
          );
        },
        dispose: () => {
          void instance.Quit().catch(() => undefined);
        },
      };
    } catch (error) {
      if (status.instance) void status.instance.Quit().catch(() => undefined);
      throw error;
    }
  } finally {
    script.remove();
  }
}
