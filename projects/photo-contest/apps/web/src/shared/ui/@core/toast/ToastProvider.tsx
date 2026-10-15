'use client';

import { Toast } from '@base-ui/react/toast';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { match } from 'ts-pattern';

import { cn } from '../../../lib/cn.helper';
import { getOverlayContainer } from '../../../lib/overlay-container.helper';
import { TOAST_TYPE, toastManager } from '../../../model/toast';

const TOAST_TIMEOUT_MS = 4_000;

function ToastIcon({ type }: { type: string | undefined }) {
  return match(type)
    .with(TOAST_TYPE.Success, () => <CircleCheck aria-hidden className="size-5 shrink-0 text-accent" />)
    .with(TOAST_TYPE.Error, () => <CircleAlert aria-hidden className="size-5 shrink-0 text-danger-soft" />)
    .otherwise(() => <Info aria-hidden className="size-5 shrink-0 text-on-brand" />);
}

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((item) => (
    <Toast.Root
      key={item.id}
      toast={item}
      swipeDirection="down"
      className={cn(
        'absolute inset-x-0 bottom-0 z-[calc(100-var(--toast-index))] origin-bottom rounded-control bg-ink text-on-brand shadow-toast select-none',
        '[transform:translateY(calc(var(--toast-swipe-movement-y)-var(--toast-index)*8px))_scale(calc(1-var(--toast-index)*0.05))]',
        'transition-[transform,opacity] duration-300 data-ending-style:opacity-0 data-limited:opacity-0',
        'data-starting-style:[transform:translateY(120%)] data-ending-style:[transform:translateY(120%)]',
      )}
    >
      <Toast.Content className="flex min-h-12 items-center gap-2.5 py-2 pr-1 pl-4 data-behind:opacity-0">
        <ToastIcon type={item.type} />
        <div className="min-w-0 flex-1">
          <Toast.Title render={<p />} className="text-label" />
          <Toast.Description render={<p />} className="text-caption opacity-80" />
        </div>
        {/* Base UI는 알림 영역에 들어오기(F6) 전까지 닫기 버튼을 보조기기에서 숨기고, 알림 내용은 따로 읽어 준다. */}
        <Toast.Close
          aria-label="알림 닫기"
          className="flex size-touch shrink-0 items-center justify-center rounded-full opacity-80 hover:opacity-100"
        >
          <X aria-hidden className="size-4" />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ));
}

/**
 * toast.success/error/info로 띄운 알림을 그린다. 콘텐츠 하단 가운데, 하단 탭·고정 CTA 위에 뜬다
 * (globals.css의 --toast-bottom).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider toastManager={toastManager} limit={3} timeout={TOAST_TIMEOUT_MS}>
      {children}
      <Toast.Portal container={getOverlayContainer()}>
        <Toast.Viewport
          aria-label="알림"
          className="fixed inset-x-0 bottom-(--toast-bottom,16px) z-toast mx-auto w-[calc(100%-32px)] max-w-[calc(var(--max-width-app)-32px)]"
        >
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}
