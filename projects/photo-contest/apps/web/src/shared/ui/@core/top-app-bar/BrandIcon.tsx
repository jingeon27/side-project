import { cn } from '../../../lib/cn.helper';

export function BrandIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="5.5"
      strokeLinecap="round"
      className={cn('size-6 shrink-0', className)}
    >
      <path d="M16 3.5v25M5.2 9.75l21.6 12.5M5.2 22.25l21.6-12.5" />
    </svg>
  );
}
