import { cn } from '../../../lib/cn.helper';

/** 불러오는 동안 자리를 잡아 두는 회색 블록. 크기는 className으로 정한다. 묶음 바깥에 role="status"를 둔다. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-control bg-neutral-soft', className)} />;
}
