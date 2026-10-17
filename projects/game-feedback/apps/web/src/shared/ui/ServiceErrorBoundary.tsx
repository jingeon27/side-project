'use client';
import { useState, type ReactNode } from 'react';
import { catchError, type ErrorInfo } from 'next/error';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorRecovery } from './ErrorRecovery';

interface IServiceErrorBoundaryProps {
  children: ReactNode;
  title: string;
  resetKey?: string;
  onReset?: () => void | Promise<unknown>;
  refreshOnRetry?: boolean;
  fallbackClassName?: string;
  recoveryAction?: ReactNode;
}

function ServiceErrorFallback(
  {
    title,
    onReset,
    refreshOnRetry,
    fallbackClassName,
    recoveryAction,
  }: Omit<IServiceErrorBoundaryProps, 'children' | 'resetKey'>,
  { reset, retry }: ErrorInfo,
) {
  const [pending, setPending] = useState(false);
  async function handleRetry() {
    if (pending) return;
    setPending(true);
    try {
      await onReset?.();
      if (refreshOnRetry) {
        retry();
        return;
      }
      // REST regions reset locally; boundaries containing Server Components refresh the route.
      reset();
    } catch {
      // Keep a failed recovery local and never expose the error payload.
    } finally {
      setPending(false);
    }
  }
  return (
    <ErrorRecovery
      title={title}
      className={fallbackClassName}
      pending={pending}
      recoveryAction={recoveryAction}
      onRetry={() => void handleRetry()}
    />
  );
}

const RegionBoundary = catchError(ServiceErrorFallback);

export function ServiceErrorBoundary({
  children,
  title,
  resetKey,
  onReset,
  refreshOnRetry,
  fallbackClassName,
  recoveryAction,
}: IServiceErrorBoundaryProps) {
  return (
    <QueryErrorResetBoundary key={resetKey}>
      {({ reset }) => (
        <RegionBoundary
          title={title}
          refreshOnRetry={refreshOnRetry}
          fallbackClassName={fallbackClassName}
          recoveryAction={recoveryAction}
          onReset={async () => {
            await onReset?.();
            reset();
          }}
        >
          {children}
        </RegionBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
