'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

import { ArrowUpRight } from 'lucide-react';

import { ButtonLink } from '@side/design-system/next';

import { ANALYTICS_EVENT, trackEvent } from '@/shared/analytics';

import { landingDestination } from '../model/landing-destination';

interface ILandingStartLinkProps {
  placement: 'header' | 'hero' | 'footer';
}

function StartLink({ placement }: ILandingStartLinkProps) {
  const destination = landingDestination(useSearchParams().get('redirect'));
  const handleClick = () =>
    trackEvent(ANALYTICS_EVENT.LandingStartClicked, {
      placement,
      destination_screen: destination.screen,
      redirect_applied: destination.redirected,
    });
  return (
    <ButtonLink
      href={destination.href}
      prefetch={false}
      variant={placement === 'header' ? 'primary' : 'accent'}
      size={placement === 'header' ? 'md' : 'lg'}
      onClick={handleClick}
    >
      시작하기 <ArrowUpRight aria-hidden className="size-4" />
    </ButtonLink>
  );
}

export function LandingStartLink({ placement }: ILandingStartLinkProps) {
  return (
    <Suspense
      fallback={
        <ButtonLink
          href="/ko"
          prefetch={false}
          variant={placement === 'header' ? 'primary' : 'accent'}
          size={placement === 'header' ? 'md' : 'lg'}
        >
          시작하기 <ArrowUpRight aria-hidden className="size-4" />
        </ButtonLink>
      }
    >
      <StartLink placement={placement} />
    </Suspense>
  );
}
