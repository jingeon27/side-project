import { cn } from '../../../lib/cn.helper';

interface ISpinnerProps {
  /** 있으면 스크린 리더에 진행 중임을 알린다(role="status"). 버튼 안처럼 다른 곳에서 알리면 생략한다. */
  label?: string;
  className?: string;
}

export function Spinner({ label, className }: ISpinnerProps) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        'inline-block size-5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent',
        className,
      )}
    />
  );
}
