'use client';

import { useState, type ReactNode } from 'react';
import { catchError, type ErrorInfo } from 'next/error';

import { QueryClient, QueryErrorResetBoundary, useMutation } from '@tanstack/react-query';

import { ErrorRecovery } from './ErrorRecovery';
import { errorRecoveryMutationOptions } from './model/error-recovery.mutation-options';

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
  // Bootstrap errors can render outside the service's QueryClientProvider.
  const [client] = useState(() => new QueryClient());
  const recovery = useMutation(errorRecoveryMutationOptions(), client);
  function handleRetry() {
    if (recovery.isPending) return;
    recovery.mutate({ onReset, refreshOnRetry, reset, retry });
  }
  return (
    <ErrorRecovery
      title={title}
      className={fallbackClassName}
      pending={recovery.isPending}
      recoveryAction={recoveryAction}
      onRetry={handleRetry}
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
