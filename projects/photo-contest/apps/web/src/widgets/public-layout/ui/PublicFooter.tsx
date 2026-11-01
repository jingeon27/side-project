import Link from 'next/link';

import { ROUTES } from '@/shared/constants/routes';
import { LegalLinks } from '@/shared/ui/@core/legal-links';
import { BrandIcon } from '@/shared/ui/@core/top-app-bar';

export function PublicFooter() {
  return (
    <footer className="border-t border-line bg-surface px-4 py-8 tablet:px-8">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6">
        <div>
          <Link
            href={ROUTES.LANDING}
            className="inline-flex min-h-touch items-center gap-2 text-title font-bold text-ink active:opacity-60"
          >
            <BrandIcon className="size-7" />
            피식
          </Link>
          <p className="mt-2 text-caption text-muted">혼자 보기 아까운 순간. © 피식</p>
        </div>
        <LegalLinks />
      </div>
    </footer>
  );
}
