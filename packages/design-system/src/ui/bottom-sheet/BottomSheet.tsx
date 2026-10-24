'use client';

import { useState, type ComponentProps, type ReactNode } from 'react';

import { Drawer } from '@base-ui/react/drawer';
import { XIcon } from 'lucide-react';

import { cn } from '../../lib/cn.helper';
import { Button } from '../button/Button';
import { dialogStyles } from '../dialog/dialog.styles';

const compactSnapPoint = 0.6;
const snapPoints = [compactSnapPoint, 1];
// ARIA slider 관례: 위·오른쪽·PageUp은 키우고 아래·왼쪽·PageDown은 줄인다. Home·End는 최소·최대다.
const expandKeys = ['ArrowUp', 'ArrowRight', 'PageUp', 'End'];
const compactKeys = ['ArrowDown', 'ArrowLeft', 'PageDown', 'Home'];

export interface IBottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenChangeComplete?: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  responsive?: boolean;
  dismissible?: boolean;
  showCloseButton?: boolean;
  closeLabel?: string;
  resizeLabel?: string;
  container?: ComponentProps<typeof Drawer.Portal>['container'];
  className?: string;
}

export function BottomSheet({
  open,
  onOpenChange,
  onOpenChangeComplete,
  title,
  description,
  children,
  footer,
  responsive = false,
  dismissible = true,
  showCloseButton = true,
  closeLabel = '닫기',
  resizeLabel = '시트 높이 조절',
  container,
  className,
}: IBottomSheetProps) {
  const [snapPoint, setSnapPoint] = useState<Drawer.Root.SnapPoint | null>(compactSnapPoint);
  const heightPercent = snapPoint === 1 ? 100 : 60;
  return (
    <Drawer.Root
      open={open}
      snapPoints={snapPoints}
      snapPoint={snapPoint}
      onSnapPointChange={(nextSnapPoint) => setSnapPoint(nextSnapPoint)}
      snapToSequentialPoints
      disablePointerDismissal={!dismissible}
      onOpenChange={(nextOpen, details) => {
        if (!nextOpen && !dismissible) {
          details.cancel();
          return;
        }
        onOpenChange(nextOpen);
      }}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) setSnapPoint(compactSnapPoint);
        onOpenChangeComplete?.(nextOpen);
      }}
    >
      <Drawer.VirtualKeyboardProvider>
        <Drawer.Portal container={container}>
          <Drawer.Backdrop className={dialogStyles.backdrop} />
          <Drawer.Viewport className="ds-sheet-viewport" data-responsive={responsive || undefined}>
            <Drawer.Popup
              className={cn('ds-sheet-popup', className)}
              data-slot="bottom-sheet-content"
              data-responsive={responsive || undefined}
            >
              <div className="ds-sheet-frame">
                <div className="ds-sheet-header">
                  <div
                    role="slider"
                    tabIndex={0}
                    className="ds-sheet-handle"
                    aria-label={resizeLabel}
                    aria-orientation="vertical"
                    aria-valuemin={60}
                    aria-valuemax={100}
                    aria-valuenow={heightPercent}
                    // 범위가 60~100이라 값만 주면 스크린 리더가 60을 0%로 읽는다.
                    aria-valuetext={`${heightPercent}%`}
                    onClick={() => setSnapPoint(snapPoint === 1 ? compactSnapPoint : 1)}
                    onKeyDown={(event) => {
                      if ([' ', 'Enter'].includes(event.key)) {
                        event.preventDefault();
                        setSnapPoint(snapPoint === 1 ? compactSnapPoint : 1);
                        return;
                      }
                      if (expandKeys.includes(event.key)) {
                        event.preventDefault();
                        setSnapPoint(1);
                        return;
                      }
                      if (!compactKeys.includes(event.key)) return;
                      event.preventDefault();
                      setSnapPoint(compactSnapPoint);
                    }}
                  >
                    <span className="ds-sheet-grip" aria-hidden="true" />
                  </div>
                  <div
                    className={cn('ds-sheet-heading px-6 pb-5', dismissible && showCloseButton && 'pr-16')}
                  >
                    <Drawer.Title className={dialogStyles.title}>{title}</Drawer.Title>
                    {description ? (
                      <Drawer.Description className={dialogStyles.description}>
                        {description}
                      </Drawer.Description>
                    ) : null}
                  </div>
                  {dismissible && showCloseButton && (
                    <Drawer.Close
                      render={<Button variant="ghost" size="icon" className="absolute right-3 top-11" />}
                    >
                      <XIcon aria-hidden="true" />
                      <span className="sr-only">{closeLabel}</span>
                    </Drawer.Close>
                  )}
                </div>
                <Drawer.Content className="ds-sheet-body">{children}</Drawer.Content>
                {footer ? (
                  <div className="ds-sheet-footer" data-slot="bottom-sheet-footer">
                    {footer}
                  </div>
                ) : null}
              </div>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.VirtualKeyboardProvider>
    </Drawer.Root>
  );
}
