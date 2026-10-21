'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

import { Drawer } from '@base-ui/react/drawer';
import { Maximize2, Minimize2, X } from 'lucide-react';

import { cn } from '../../../lib/cn.helper';
import { getOverlayContainer } from '../../../lib/overlay-container.helper';
import type { IOverlayControlProps } from '../../../lib/overlay.type';
import { useOverlayHistory } from '../../../model/router';
import { IconButton } from '../icon-button';

interface IBottomSheetRootProps extends IOverlayControlProps {
  /** Header(제목 필수) → Content(스크롤) → Footer(고정) 순서로 넣는다. */
  children: ReactNode;
  className?: string;
  /** 첫 높이로 열리고 드래그하거나 헤더 버튼으로 확장한다. 0~1은 화면 높이의 비율이다. */
  snapPoints?: Drawer.Root.SnapPoint[];
}

interface IBottomSheetResizeContext {
  expanded: boolean;
  onToggle: () => void;
}

const BottomSheetResizeContext = createContext<IBottomSheetResizeContext | null>(null);

/**
 * 아래에서 올라오는 시트. 열려 있는 동안 history 항목을 하나 차지해 브라우저·안드로이드 뒤로 가기가 시트를 먼저 닫는다.
 * 닫으면 연 버튼으로 포커스가 돌아간다. 아래로 밀어서 닫을 수 있다.
 */
function Root({ isOpen, onClose, unmount, children, className, snapPoints }: IBottomSheetRootProps) {
  useOverlayHistory(isOpen, onClose);
  const [snapPoint, setSnapPoint] = useState<Drawer.Root.SnapPoint | null>(snapPoints?.[0] ?? null);
  const resizable = Boolean(snapPoints && snapPoints.length > 1);
  const expanded = snapPoint === snapPoints?.at(-1);
  return (
    <Drawer.Root
      open={isOpen}
      snapPoints={snapPoints}
      snapPoint={snapPoint}
      snapToSequentialPoints={resizable}
      onSnapPointChange={setSnapPoint}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onOpenChangeComplete={(open) => {
        if (!open) unmount?.();
      }}
    >
      <Drawer.VirtualKeyboardProvider>
        <Drawer.Portal container={getOverlayContainer()}>
          <Drawer.Backdrop
            data-bottom-sheet-backdrop
            className={cn(
              'fixed inset-0 z-sheet bg-scrim transition-opacity duration-[450ms] ease-sheet data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0',
              resizable
                ? 'opacity-[calc(0.3+0.4*(1-var(--drawer-swipe-progress)))]'
                : 'opacity-[calc(1-var(--drawer-swipe-progress))]',
            )}
          />
          <Drawer.Viewport className="fixed inset-0 z-sheet flex items-end pb-[var(--drawer-keyboard-inset,0px)]">
            <Drawer.Popup
              className={cn(
                'flex max-h-[calc(100dvh-var(--safe-top)-var(--drawer-keyboard-inset,0px)-24px)] w-full flex-col',
                'overflow-hidden rounded-t-sheet bg-surface text-ink shadow-sheet outline-none',
                '[transform:translateY(calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y,0px)))] transition-[transform,padding-bottom] duration-[450ms] ease-sheet',
                'data-ending-style:[transform:translateY(100%)] data-starting-style:[transform:translateY(100%)] data-swiping:select-none data-swiping:duration-0',
                // 이동한 높이만큼 내부 공간을 줄여 입력창이 화면 밖으로 밀리지 않게 한다.
                resizable &&
                  '[padding-bottom:max(0px,calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y,0px)))]',
                className,
              )}
            >
              <div aria-hidden className="flex shrink-0 touch-none justify-center pt-2.5 pb-1">
                <span className="h-1 w-10 rounded-full bg-line-strong" />
              </div>
              <BottomSheetResizeContext
                value={
                  resizable
                    ? {
                        expanded,
                        onToggle: () =>
                          setSnapPoint(expanded ? (snapPoints?.[0] ?? null) : (snapPoints?.at(-1) ?? null)),
                      }
                    : null
                }
              >
                {children}
              </BottomSheetResizeContext>
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
  const resize = useContext(BottomSheetResizeContext);
  return (
    <div className={cn('flex shrink-0 touch-none items-start gap-2 pr-2 pb-3 pl-5', className)}>
      <div className="min-w-0 flex-1 pt-2.5">
        <Drawer.Title className="text-title text-ink">{title}</Drawer.Title>
        {description ? (
          <Drawer.Description className="mt-1 text-body text-muted">{description}</Drawer.Description>
        ) : null}
      </div>
      {resize ? (
        <IconButton
          label={resize.expanded ? '시트 축소' : '시트 전체 화면으로 확장'}
          aria-expanded={resize.expanded}
          data-base-ui-swipe-ignore
          onClick={() => resize.onToggle()}
        >
          {resize.expanded ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
        </IconButton>
      ) : null}
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
