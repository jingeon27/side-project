'use client';

import { useState, type ComponentProps, type ReactNode } from 'react';

import { Drawer } from '@base-ui/react/drawer';
import { XIcon } from 'lucide-react';

import { cn } from '../../lib/cn.helper';
import { Button } from '../button/Button';
import { dialogStyles } from '../dialog/dialog.styles';

const compactSnapPoint = 0.6;
const snapPoints = [compactSnapPoint, 1];

export interface IBottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenChangeComplete?: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  dismissible?: boolean;
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
  dismissible = true,
  closeLabel = '닫기',
  resizeLabel = '시트 높이 조절',
  container,
  className,
}: IBottomSheetProps) {
  const [snapPoint, setSnapPoint] = useState<Drawer.Root.SnapPoint | null>(compactSnapPoint);
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
          <Drawer.Viewport className="ds-sheet-viewport">
            <Drawer.Popup className={cn('ds-sheet-popup', className)} data-slot="bottom-sheet-content">
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
                    aria-valuenow={snapPoint === 1 ? 100 : 60}
                    onClick={() => setSnapPoint(snapPoint === 1 ? compactSnapPoint : 1)}
                    onKeyDown={(event) => {
                      if ([' ', 'Enter'].includes(event.key)) {
                        event.preventDefault();
                        setSnapPoint(snapPoint === 1 ? compactSnapPoint : 1);
                        return;
                      }
                      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
                      event.preventDefault();
                      setSnapPoint(['ArrowUp', 'End'].includes(event.key) ? 1 : compactSnapPoint);
                    }}
                  >
                    <span className="ds-sheet-grip" aria-hidden="true" />
                  </div>
                  <div className={cn('px-6 pb-5', dismissible && 'pr-16')}>
                    <Drawer.Title className={dialogStyles.title}>{title}</Drawer.Title>
                    {description ? (
                      <Drawer.Description className={dialogStyles.description}>
                        {description}
                      </Drawer.Description>
                    ) : null}
                  </div>
                  {dismissible && (
                    <Drawer.Close
                      render={<Button variant="ghost" size="icon" className="absolute right-3 top-11" />}
                    >
                      <XIcon aria-hidden="true" />
                      <span className="sr-only">{closeLabel}</span>
                    </Drawer.Close>
                  )}
                </div>
                <Drawer.Content className="ds-sheet-body">{children}</Drawer.Content>
              </div>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.VirtualKeyboardProvider>
    </Drawer.Root>
  );
}
