import type { ReactNode } from 'react';
import { buttonVariants, cn } from '@side/design-system';
import { TabLink } from '@/shared/navigation';

interface IBoardFilterLinkProps {
  href: string;
  active: boolean;
  children: ReactNode;
}

export function BoardFilterLink({ href, active, children }: IBoardFilterLinkProps) {
  return (
    <TabLink
      href={href}
      replace
      aria-current={active ? 'page' : undefined}
      className={cn(buttonVariants({ variant: active ? 'accent' : 'secondary', size: 'sm' }), 'rounded-full')}
    >
      {children}
    </TabLink>
  );
}
