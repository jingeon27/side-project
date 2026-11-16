'use client';

import { Suspense, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import { z } from 'zod';

import { ROUTES } from '@/shared/constants/routes';
import { getSafeNextPath } from '@/shared/lib/login-redirect.helper';
import { ANALYTICS_EVENT, toPathTemplate, trackEvent } from '@/shared/model/analytics';
import { ButtonLink, type IButtonProps } from '@/shared/ui/@core/button';

interface IPublicStartLinkProps {
  children: ReactNode;
  placement: 'header' | 'hero' | 'guide';
  size?: IButtonProps['size'];
}

function StartLink({ children, placement, size }: IPublicStartLinkProps) {
  const pathname = usePathname();
  const redirect = useSearchParams().get('redirect');
  const destination = getSafeNextPath(redirect);
  const groupId = z.cuid().safeParse(/^\/groups\/([^/?#]+)(?:[?#].*)?$/.exec(destination)?.[1]);

  return (
    <ButtonLink
      href={destination}
      prefetch={false}
      size={size}
      onClick={() =>
        trackEvent(ANALYTICS_EVENT.LandingStartClicked, {
          placement,
          source_path_template: toPathTemplate(pathname),
          destination_path_template: toPathTemplate(destination),
          redirect_applied: Boolean(redirect && redirect === destination),
          ...(groupId.success ? { group_id: groupId.data } : {}),
        })
      }
    >
      {children}
    </ButtonLink>
  );
}

export function PublicStartLink(props: IPublicStartLinkProps) {
  return (
    <Suspense
      fallback={
        <ButtonLink href={ROUTES.HOME} prefetch={false} size={props.size}>
          {props.children}
        </ButtonLink>
      }
    >
      <StartLink {...props} />
    </Suspense>
  );
}
