import {
  BRIDGE_EVENT,
  parseNativeMessage,
  type IAppInfo,
  type TLoginProvider,
  type TPushRegistration,
  type TWebMessage,
} from '@game-feedback/bridge';

interface INativeWindow extends Window {
  __GAME_FEEDBACK_APP__?: IAppInfo;
  ReactNativeWebView?: { postMessage: (data: string) => void };
}
export const NATIVE_BOOTSTRAP_EVENT = 'game-feedback:bootstrap';
export function isNativeApp() {
  return (
    typeof window !== 'undefined' &&
    (window as INativeWindow).__GAME_FEEDBACK_APP__?.protocol === 1 &&
    !!(window as INativeWindow).ReactNativeWebView
  );
}
export function postToNative(message: TWebMessage) {
  if (isNativeApp()) (window as INativeWindow).ReactNativeWebView?.postMessage(JSON.stringify(message));
}
export function requestNativeLogin(
  provider: TLoginProvider = 'google',
): Promise<{ code: string; verifier: string } | null> {
  if (!isNativeApp()) return Promise.reject(new Error('앱에서 다시 시도해 주세요.'));
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('로그인 시간이 초과되었습니다.'));
    }, 180_000);
    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener(BRIDGE_EVENT, handleMessage);
    }
    function handleMessage(event: Event) {
      const message = parseNativeMessage((event as CustomEvent<unknown>).detail);
      if (message?.type !== 'auth-result' || message.id !== id) return;
      cleanup();
      if (message.status === 'cancelled') {
        resolve(null);
        return;
      }
      if (message.status === 'failed') {
        reject(new Error('로그인하지 못했습니다. 다시 시도해 주세요.'));
        return;
      }
      if (message.status === 'success') resolve({ code: message.code, verifier: message.verifier });
    }
    window.addEventListener(BRIDGE_EVENT, handleMessage);
    postToNative({ type: 'auth-request', id, provider });
  });
}

export function supportsNativePush() {
  return (
    isNativeApp() && (window as INativeWindow).__GAME_FEEDBACK_APP__?.capabilities?.includes('push') === true
  );
}
export function requestNativePush(requestPermission = false): Promise<TPushRegistration | null> {
  if (!supportsNativePush()) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener(BRIDGE_EVENT, receive);
    };
    const receive = (event: Event) => {
      const message = parseNativeMessage((event as CustomEvent<unknown>).detail);
      if (message?.type !== 'push-result' || message.id !== id) return;
      cleanup();
      resolve(message.registration);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('알림 설정 시간을 초과했어요. 다시 시도해 주세요.'));
    }, 120_000);
    window.addEventListener(BRIDGE_EVENT, receive);
    postToNative({ type: 'push-request', id, requestPermission });
  });
}
