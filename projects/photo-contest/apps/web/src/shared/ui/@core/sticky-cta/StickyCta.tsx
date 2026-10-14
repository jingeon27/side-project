import type { ReactNode } from 'react';

import { cn } from '../../../lib/cn.helper';

/**
 * 화면 하단에 붙는 주 행동 영역(사진 제출하기 등). `flex min-h-dvh flex-col` 화면의 마지막 자식으로 둔다.
 * 안에는 `<Button size="lg" fullWidth>`를 넣는다. 기기 하단 안전 영역만큼 띄운다.
 */
export function StickyCta({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-sticky-cta
      className={cn(
        'sticky bottom-0 z-sticky-cta mt-auto border-t border-line bg-surface px-4 pt-3 pb-[calc(16px+var(--safe-bottom))]',
        className,
      )}
    >
      {children}
    </div>
  );
}
