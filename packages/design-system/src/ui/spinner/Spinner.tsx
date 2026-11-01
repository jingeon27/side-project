import type { ComponentProps } from 'react';

import { cn } from '../../lib/cn.helper';
import { StatusAnimation } from '../status-animation/StatusAnimation';

export interface ISpinnerProps extends Omit<ComponentProps<'span'>, 'className' | 'children' | 'role'> {
  /**
   * 있으면 스크린 리더에 진행 중임을 알린다(role="status" 안의 숨긴 글자).
   * live region은 aria-label이 아니라 내용 변화를 읽으므로 글자로 넣는다. 버튼 안처럼 다른 곳에서 알리면 생략한다.
   */
  label?: string;
  className?: string;
}

/** native span props(id·title·data-*·ref)는 그대로 전달한다. role과 숨김 여부는 label로 정한다. */
export function Spinner({ label, className, ...props }: ISpinnerProps) {
  return (
    <span
      data-slot="spinner"
      {...props}
      role={label ? 'status' : undefined}
      aria-hidden={label ? undefined : true}
      className={cn('inline-flex size-5 shrink-0 items-center justify-center', className)}
    >
      <StatusAnimation variant="loading" className="size-full text-current" />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
