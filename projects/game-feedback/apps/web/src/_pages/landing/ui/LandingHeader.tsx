'use client';

import Link from 'next/link';

import { useScrollVisibility } from '@side/design-system/lib/use-scroll-visibility';

import { GameMateLogo } from '@/shared/ui';

import { LandingStartLink } from './LandingStartLink';

export function LandingHeader() {
  const { ref, hidden } = useScrollVisibility<HTMLElement>();
  return (
    <header ref={ref} className="landing-header" data-hidden={hidden || undefined} inert={hidden}>
      <nav aria-label="서비스 소개" className="landing-container landing-header-inner">
        <Link href="/about" prefetch={false} aria-label="Game Mate 소개" className="landing-brand">
          <GameMateLogo />
        </Link>
        <LandingStartLink placement="header" />
      </nav>
    </header>
  );
}
