'use client';

import type { ReactNode } from 'react';

import {
  BottomSheet as Sheet,
  type IBottomSheetRootProps as IPrimitiveBottomSheetRootProps,
  type TBottomSheetSnapPoint,
} from '@side/design-system';

import { cn } from '../../../lib/cn.helper';
import type { IOverlayControlProps } from '../../../lib/overlay.type';
import { useOverlayHistory } from '../../../model/router';
import { OverlayPortal } from '../overlay-portal';

interface IBottomSheetRootProps
  extends IOverlayControlProps, Pick<IPrimitiveBottomSheetRootProps, 'initialFocus' | 'finalFocus'> {
  children: ReactNode;
  className?: string;
  snapPoints?: TBottomSheetSnapPoint[];
  /** 상위가 history 항목을 소유하면 false로 둔다. 폭에 따라 시트와 모달을 바꿔 보여 주는 댓글이 쓴다. */
  ownsHistory?: boolean;
}

/**
 * 같은 DOM을 모바일에서는 시트로, 768px부터는 중앙 모달로 보여 준다.
 * 이 앱의 화면은 전체 폭을 쓰므로 768px 미만 시트는 공통 기본 최대 폭(540px)을 풀어 화면 너비를 채운다.
 */
function Root({
  isOpen,
  onClose,
  unmount,
  children,
  className,
  snapPoints,
  initialFocus,
  finalFocus,
  ownsHistory = true,
}: IBottomSheetRootProps) {
  useOverlayHistory(ownsHistory && isOpen, onClose);
  return (
    <OverlayPortal>
      {(container) => (
        <Sheet.Root
          open={isOpen}
          responsive
          snapPoints={snapPoints}
          initialFocus={initialFocus}
          finalFocus={finalFocus}
          container={container}
          className={cn('max-tablet:max-w-none', className)}
          onOpenChange={(open) => {
            if (!open) onClose();
          }}
          onOpenChangeComplete={(open) => {
            if (!open) unmount?.();
          }}
        >
          <Sheet.Handle label="시트 높이 조절" />
          {children}
        </Sheet.Root>
      )}
    </OverlayPortal>
  );
}

interface IBottomSheetHeaderProps {
  title: string;
  description?: ReactNode;
  className?: string;
  /** 제목 옆 닫기 버튼의 이름. 생략하면 버튼 없이 밀기·Esc·바깥 누르기·뒤로 가기로 닫는다. */
  closeLabel?: string;
}

function Header({ closeLabel, ...props }: IBottomSheetHeaderProps) {
  return (
    <Sheet.Header {...props}>
      {closeLabel ? <Sheet.Close label={closeLabel} className="h-touch px-4" /> : null}
    </Sheet.Header>
  );
}

function Content({ children, className }: { children: ReactNode; className?: string }) {
  return <Sheet.Content className={className}>{children}</Sheet.Content>;
}

/** 폼의 취소와 제출은 같은 행에서 같은 너비를 쓴다. 댓글 입력창은 cancelLabel={false}로 둔다. */
function Footer({
  children,
  className,
  cancelLabel = '취소',
}: {
  children: ReactNode;
  className?: string;
  cancelLabel?: string | false;
}) {
  return (
    <Sheet.Footer className={cn('[&>*]:min-w-0 [&>*]:flex-1', className)}>
      {cancelLabel ? <Sheet.Close label={cancelLabel} /> : null}
      {children}
    </Sheet.Footer>
  );
}

export const BottomSheet = { Root, Header, Content, Footer };
