import Link from 'next/link';

import { ArrowUpRight } from 'lucide-react';

import { ROUTES } from '@/shared/constants/routes';
import { ButtonLink } from '@/shared/ui/@core/button';
import { BrandIcon } from '@/shared/ui/@core/top-app-bar';

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-app-bar border-b border-line bg-surface/95 px-4 pt-(--safe-top) backdrop-blur-lg tablet:px-8">
      <nav
        aria-label="서비스 안내"
        className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 py-4"
      >
        <Link
          href={ROUTES.LANDING}
          aria-label="피식 소개"
          className="flex min-h-touch items-center gap-2.5 text-title-lg font-extrabold tracking-tighter text-ink active:opacity-60"
        >
          <BrandIcon className="size-9 -rotate-6" />
          피식
        </Link>
        <div className="flex items-center gap-2 tablet:gap-6">
          <Link
            href={ROUTES.HOW_IT_WORKS}
            className="inline-flex min-h-touch items-center text-label text-muted hover:text-ink active:opacity-60"
          >
            이용 방법
          </Link>
          <ButtonLink
            href={ROUTES.SIGN}
            prefetch={false}
            variant="ghost"
            size="md"
            className="hidden tablet:inline-flex"
          >
            로그인
          </ButtonLink>
          <ButtonLink href={ROUTES.HOME} prefetch={false} size="md">
            시작하기 <ArrowUpRight aria-hidden className="size-4" />
          </ButtonLink>
        </div>
      </nav>
    </header>
  );
}
