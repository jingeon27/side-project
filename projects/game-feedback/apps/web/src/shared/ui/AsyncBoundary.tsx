'use client';
import { Suspense, type ComponentProps, type ReactNode } from 'react';
import { useIsSSR } from '../lib/use-is-ssr';
import { ServiceErrorBoundary } from './ServiceErrorBoundary';
import { LoadingState } from './LoadingState';

type TAsyncBoundaryProps = ComponentProps<typeof ServiceErrorBoundary> & {
  pendingFallback?: ReactNode;
  clientOnly?: boolean;
  suspense?: boolean;
};

export function AsyncBoundary({
  children,
  pendingFallback = <LoadingState />,
  clientOnly = false,
  suspense = true,
  ...props
}: TAsyncBoundaryProps) {
  const isSSR = useIsSSR();
  return (
    <ServiceErrorBoundary {...props}>
      {suspense ? (
        <Suspense fallback={pendingFallback}>{clientOnly && isSSR ? pendingFallback : children}</Suspense>
      ) : (
        children
      )}
    </ServiceErrorBoundary>
  );
}
