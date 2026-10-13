import { Toast } from '@base-ui/react/toast';

export const TOAST_TYPE = {
  Success: 'success',
  Error: 'error',
  Info: 'info',
} as const;
export type TToastType = (typeof TOAST_TYPE)[keyof typeof TOAST_TYPE];

interface IToastOptions {
  description?: string;
  /** 같은 id로 다시 띄우면 새로 쌓지 않고 그 토스트를 갱신한다. */
  id?: string;
}

/** React 밖(Apollo ErrorLink 등)에서도 띄울 수 있게 앱에 하나만 둔다. 화면에는 app의 ToastProvider가 그린다. */
export const toastManager = Toast.createToastManager<Record<string, never>>();

const show = (type: TToastType, title: string, options: IToastOptions = {}) =>
  toastManager.add({
    type,
    title,
    description: options.description,
    // 같은 오류가 연달아 나도(재시도·polling) 토스트를 겹겹이 쌓지 않는다.
    id: options.id ?? (type === TOAST_TYPE.Error ? `error:${title}` : undefined),
    priority: type === TOAST_TYPE.Error ? 'high' : 'low',
  });

/** 화면 하단 가운데에 잠깐 보이는 알림. 하단 탭·고정 CTA 위에 뜬다. */
export const toast = {
  success: (title: string, options?: IToastOptions) => show(TOAST_TYPE.Success, title, options),
  error: (title: string, options?: IToastOptions) => show(TOAST_TYPE.Error, title, options),
  info: (title: string, options?: IToastOptions) => show(TOAST_TYPE.Info, title, options),
  close: (id?: string) => toastManager.close(id),
};
