'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

import { match } from 'ts-pattern';

import { ButtonLink, type IButtonLinkProps } from '@side/design-system/next';

import { trackStudioEvent, type TStudioSource } from '../../../shared/analytics';

export function StudioLink({
  source,
  variant,
  className,
  children,
}: {
  source: TStudioSource;
  variant?: IButtonLinkProps['variant'];
  className?: string;
  children: ReactNode;
}) {
  const href = match(source)
    .with('blank', () => '/studio')
    .with('sample', () => '/studio?sample=1')
    .with('demo', () => '/studio?demo=bundled')
    .otherwise((format) => `/studio?format=${format}`);
  const linkProps = {
    href,
    className,
    onClick: () => void trackStudioEvent('landing_start_clicked', { source }),
  };
  return variant ? (
    <ButtonLink {...linkProps} variant={variant}>
      {children}
    </ButtonLink>
  ) : (
    <Link {...linkProps}>{children}</Link>
  );
}
