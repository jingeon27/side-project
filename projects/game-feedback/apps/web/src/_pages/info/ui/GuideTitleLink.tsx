import type { ReactNode } from 'react';
import Link from 'next/link';

import { ArrowRight } from 'lucide-react';

export function GuideTitleLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="guide-title-link">
      <span>{children}</span>
      <ArrowRight aria-hidden size={20} />
    </Link>
  );
}
