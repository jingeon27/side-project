import Link from 'next/link';

import { ROUTES } from '../../../constants/routes';
import { cn } from '../../../lib/cn.helper';

export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="서비스 정책" className={cn('flex flex-wrap items-center gap-x-4', className)}>
      <Link
        href={ROUTES.TERMS}
        className="inline-flex min-h-touch items-center text-caption text-muted underline-offset-4 hover:underline active:text-ink"
      >
        이용약관
      </Link>
      <Link
        href={ROUTES.PRIVACY}
        className="inline-flex min-h-touch items-center text-caption font-semibold text-ink underline-offset-4 hover:underline active:opacity-60"
      >
        개인정보 처리방침
      </Link>
    </nav>
  );
}
