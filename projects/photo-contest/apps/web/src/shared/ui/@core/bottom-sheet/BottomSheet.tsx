'use client';

import type { ReactNode } from 'react';

import { BottomSheet as Sheet, type TBottomSheetSnapPoint } from '@side/design-system';

import { cn } from '../../../lib/cn.helper';
import { getOverlayContainer } from '../../../lib/overlay-container.helper';
import type { IOverlayControlProps } from '../../../lib/overlay.type';
import { useOverlayHistory } from '../../../model/router';

interface IBottomSheetRootProps extends IOverlayControlProps {
  children: ReactNode;
  className?: string;
  snapPoints?: TBottomSheetSnapPoint[];
}

/**
 * 같은 DOM을 모바일에서는 시트로, 768px부터는 중앙 모달로 보여 준다.
 * 이 앱의 화면은 전체 폭을 쓰므로 768px 미만 시트는 공통 기본 최대 폭(540px)을 풀어 화면 너비를 채운다.
 */
function Root({ isOpen, onClose, unmount, children, className, snapPoints }: IBottomSheetRootProps) {
  useOverlayHistory(isOpen, onClose);
  return (
    <Sheet.Root
      open={isOpen}
      responsive
      snapPoints={snapPoints}
      container={getOverlayContainer()}
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
  );
}

interface IBottomSheetHeaderProps {
  title: string;
  description?: ReactNode;
  className?: string;
  /** 하단 취소가 없는 시트(Footer cancelLabel={false})는 이 이름의 닫기 버튼을 제목 옆에 둔다. */
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

/** 폼의 취소와 제출은 같은 행에서 같은 너비를 쓴다. 댓글 입력창은 cancelLabel={false}로 두고 Header에 closeLabel을 준다. */
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
