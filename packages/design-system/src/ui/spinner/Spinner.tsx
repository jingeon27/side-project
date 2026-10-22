import { cn } from '../../lib/cn.helper';

export interface ISpinnerProps {
  /**
   * 있으면 스크린 리더에 진행 중임을 알린다(role="status" 안의 숨긴 글자).
   * live region은 aria-label이 아니라 내용 변화를 읽으므로 글자로 넣는다. 버튼 안처럼 다른 곳에서 알리면 생략한다.
   */
  label?: string;
  className?: string;
}

export function Spinner({ label, className }: ISpinnerProps) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-hidden={label ? undefined : true}
      className={cn(
        'inline-block size-5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent',
        className,
      )}
    >
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
