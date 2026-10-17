'use client';

import { Drawer } from '@base-ui/react/drawer';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../../../lib/cn.helper';
import { getOverlayContainer } from '../../../lib/overlay-container.helper';
import type { IOverlayControlProps } from '../../../lib/overlay.type';
import { useOverlayHistory } from '../../../model/router';
import { IconButton } from '../icon-button';

interface IBottomSheetRootProps extends IOverlayControlProps {
  /** Header(제목 필수) → Content(스크롤) → Footer(고정) 순서로 넣는다. */
  children: ReactNode;
  className?: string;
}

/**
 * 아래에서 올라오는 시트. 열려 있는 동안 history 항목을 하나 차지해 브라우저·안드로이드 뒤로 가기가 시트를 먼저 닫는다.
 * 닫으면 연 버튼으로 포커스가 돌아간다. 아래로 밀어서 닫을 수 있다.
 */
function Root({ isOpen, onClose, unmount, children, className }: IBottomSheetRootProps) {
  useOverlayHistory(isOpen, onClose);
  return (
    <Drawer.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onOpenChangeComplete={(open) => {
        if (!open) unmount?.();
      }}
    >
      <Drawer.VirtualKeyboardProvider>
        <Drawer.Portal container={getOverlayContainer()}>
          <Drawer.Backdrop className="fixed inset-0 z-sheet bg-scrim opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-[450ms] ease-sheet data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0" />
          <Drawer.Viewport className="fixed inset-0 z-sheet flex items-end pb-[var(--drawer-keyboard-inset,0px)]">
            <Drawer.Popup
              className={cn(
                'flex max-h-[calc(100dvh-var(--safe-top)-var(--drawer-keyboard-inset,0px)-24px)] w-full flex-col',
                'overflow-hidden rounded-t-sheet bg-surface text-ink shadow-sheet outline-none',
                '[transform:translateY(var(--drawer-swipe-movement-y))] transition-transform duration-[450ms] ease-sheet',
                'data-ending-style:[transform:translateY(100%)] data-starting-style:[transform:translateY(100%)] data-swiping:select-none',
                className,
              )}
            >
              <div aria-hidden className="flex shrink-0 justify-center pt-2.5 pb-1">
                <span className="h-1 w-10 rounded-full bg-line-strong" />
              </div>
              {children}
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.VirtualKeyboardProvider>
    </Drawer.Root>
  );
}

interface IBottomSheetHeaderProps {
  /** 시트의 이름. 스크린 리더가 대화상자 이름으로 읽는다. */
  title: string;
  description?: ReactNode;
  className?: string;
}

function Header({ title, description, className }: IBottomSheetHeaderProps) {
  return (
    <div className={cn('flex shrink-0 items-start gap-2 pr-2 pb-3 pl-5', className)}>
      <div className="min-w-0 flex-1 pt-2.5">
        <Drawer.Title className="text-title text-ink">{title}</Drawer.Title>
        {description ? (
          <Drawer.Description className="mt-1 text-body text-muted">{description}</Drawer.Description>
        ) : null}
      </div>
      <Drawer.Close render={<IconButton label="닫기" />}>
        <X className="size-5" />
      </Drawer.Close>
    </div>
  );
}

/** 시트에서 이 부분만 스크롤된다. */
function Content({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Drawer.Content
      data-bottom-sheet-content
      className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5', className)}
    >
      {children}
    </Drawer.Content>
  );
}

/** 시트 아래 고정 영역(제출 버튼 등). 기기 하단 안전 영역만큼 띄운다. */
function Footer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'shrink-0 border-t border-line bg-surface px-5 pt-3 pb-[calc(16px+var(--safe-bottom))]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export const BottomSheet = { Root, Header, Content, Footer };
