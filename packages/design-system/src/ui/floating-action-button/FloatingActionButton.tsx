import type { ReactNode } from 'react';

import { cva } from 'class-variance-authority';
import { Plus } from 'lucide-react';

import { cn } from '../../lib/cn.helper';
import { Button, type IButtonProps } from '../button/Button';

const floatingActionButtonVariants = cva([
  'group/floating-action h-14 min-w-14 gap-0 overflow-hidden border-0 p-0 shadow-toast',
  // Button의 눌림 이동·축소와 같은 조건을 써야 명시도가 같고 생성 CSS에서 뒤에 나와 모션 감소 설정에서 이긴다.
  'motion-reduce:transition-none motion-reduce:active:not-aria-[haspopup]:translate-y-0 motion-reduce:active:not-data-disabled:scale-100',
]);

const labelVariants = cva(
  [
    'grid transition-[grid-template-columns,opacity] duration-150 ease-out motion-reduce:transition-none',
    'group-focus-visible/floating-action:grid-cols-[1fr] group-focus-visible/floating-action:opacity-100',
  ],
  {
    variants: {
      compact: {
        true: 'grid-cols-[0fr] opacity-0',
        false: 'grid-cols-[1fr] opacity-100',
      },
    },
    defaultVariants: { compact: false },
  },
);

export interface IFloatingActionButtonProps extends Pick<
  IButtonProps,
  'disabled' | 'ref' | 'className' | 'aria-haspopup' | 'aria-expanded' | 'aria-controls' | 'aria-describedby'
> {
  /** 보이는 글자와 접근성 이름. 소비 앱이 번역한다. */
  label: string;
  /** 아이콘만 표시한다. 키보드 포커스 중에는 글자가 다시 보인다. */
  compact?: boolean;
  /** 기본 아이콘은 Plus이며 전달한 아이콘도 장식으로 처리한다. */
  icon?: ReactNode;
  onClick: NonNullable<IButtonProps['onClick']>;
}

/** 56px 주 행동 버튼. 배치·스크롤 상태·이동과 인증은 소비 앱이 소유한다. */
export function FloatingActionButton({
  label,
  compact = false,
  icon = <Plus className="size-5" />,
  className,
  ...props
}: IFloatingActionButtonProps) {
  return (
    <Button
      {...props}
      type="button"
      variant="accent"
      size="lg"
      shape="pill"
      aria-label={label}
      data-compact={compact}
      className={cn(floatingActionButtonVariants(), className)}
    >
      <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center">
        {icon}
      </span>
      <span aria-hidden="true" className={labelVariants({ compact })}>
        <span className="min-w-0 overflow-hidden">
          <span className="inline-block pe-5">{label}</span>
        </span>
      </span>
    </Button>
  );
}
