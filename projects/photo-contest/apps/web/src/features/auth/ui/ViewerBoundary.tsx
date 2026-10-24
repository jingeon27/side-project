'use client';

import type { ReactNode } from 'react';

import { useBackgroundQuery, useReadQuery, type QueryRef } from '@apollo/client/react';
import { match, P } from 'ts-pattern';

import { MeDocument, type MeQuery } from '@/shared/api/generated';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';

interface IViewerBoundaryProps {
  children: (viewerId: string, viewerRef: QueryRef<MeQuery>) => ReactNode;
  guest: ReactNode;
  fallback: ReactNode;
}

function ViewerContent({
  viewerRef,
  children,
  guest,
  fallback,
}: IViewerBoundaryProps & { viewerRef: QueryRef<MeQuery> }) {
  const { data } = useReadQuery(viewerRef);
  return match(data.me)
    .with(null, () => guest)
    .with({ needsOnboarding: true }, () => fallback)
    .with(P.nonNullable, (viewer) => children(viewer.id, viewerRef))
    .exhaustive();
}

export function ViewerBoundary({ children, guest, fallback }: IViewerBoundaryProps) {
  const [viewerRef, { refetch }] = useBackgroundQuery(MeDocument);
  return (
    <AsyncBoundary fallback={fallback} onRetry={() => refetch()}>
      <ViewerContent viewerRef={viewerRef} guest={guest} fallback={fallback}>
        {children}
      </ViewerContent>
    </AsyncBoundary>
  );
}
