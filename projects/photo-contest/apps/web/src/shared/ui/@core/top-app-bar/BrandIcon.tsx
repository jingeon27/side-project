import Image from 'next/image';

import { cn } from '../../../lib/cn.helper';

export function BrandIcon({ className }: { className?: string }) {
  return (
    <Image
      src="/icon.svg"
      alt=""
      aria-hidden
      width={24}
      height={24}
      loading="eager"
      unoptimized
      className={cn('size-6 shrink-0', className)}
    />
  );
}
