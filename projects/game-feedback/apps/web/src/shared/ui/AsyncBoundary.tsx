'use client';
import { Suspense, useSyncExternalStore, type ComponentProps, type ReactNode } from 'react';
import { ServiceErrorBoundary } from './ServiceErrorBoundary';
import { LoadingState } from './LoadingState';

type TAsyncBoundaryProps = ComponentProps<typeof ServiceErrorBoundary> & {
  pendingFallback?: ReactNode;
  clientOnly?: boolean;
  suspense?: boolean;
};

const subscribe = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function AsyncBoundary({
  children,
  pendingFallback = <LoadingState />,
  clientOnly = false,
  suspense = true,
  ...props
}: TAsyncBoundaryProps) {
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return (
    <ServiceErrorBoundary {...props}>
      {suspense ? (
        <Suspense fallback={pendingFallback}>{clientOnly && !hydrated ? pendingFallback : children}</Suspense>
      ) : (
        children
      )}
    </ServiceErrorBoundary>
  );
}
