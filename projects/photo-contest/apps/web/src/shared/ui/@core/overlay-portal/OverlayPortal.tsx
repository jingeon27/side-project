'use client';

import dynamic from 'next/dynamic';

import type { IOverlayPortalProps } from './OverlayPortalClient';

const ClientPortal = dynamic(async () => (await import('./OverlayPortalClient')).OverlayPortalClient, {
  ssr: false,
});

export function OverlayPortal(props: IOverlayPortalProps) {
  return <ClientPortal {...props} />;
}
