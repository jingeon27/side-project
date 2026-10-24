import { cn } from '../../lib/cn.helper';

export function Mention({ nickname, className }: { nickname: string; className?: string }) {
  return (
    <span
      data-slot="mention"
      className={cn(
        'inline-flex max-w-full rounded-badge border border-line-strong bg-sunken px-1.5 text-caption font-medium text-ink wrap-anywhere',
        className,
      )}
    >
      @{nickname}
    </span>
  );
}
