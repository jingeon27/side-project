'use client';

import { Component, Suspense } from 'react';
import type { ReactNode } from 'react';
import { match } from 'ts-pattern';

import { getErrorMessage } from '../../../model/error';
import { ErrorState } from '../error-state';

interface IAsyncBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  onRetry: () => Promise<unknown>;
  resetKey?: string;
  errorTitle?: string;
  renderError?: (error: unknown, retry: () => void) => ReactNode;
}
type TErrorState = { status: 'ready' } | { status: 'failed' | 'retrying'; error: unknown };

class QueryErrorBoundary extends Component<Omit<IAsyncBoundaryProps, 'fallback' | 'resetKey'>, TErrorState> {
  state: TErrorState = { status: 'ready' };

  static getDerivedStateFromError(error: unknown): TErrorState {
    return { status: 'failed', error };
  }

  private async handleRetry() {
    if (this.state.status !== 'failed') return;
    const { error } = this.state;
    this.setState({ status: 'retrying', error });
    try {
      await this.props.onRetry();
      this.setState({ status: 'ready' });
    } catch (nextError) {
      this.setState({ status: 'failed', error: nextError });
    }
  }

  render() {
    return match(this.state)
      .with({ status: 'ready' }, () => this.props.children)
      .with({ status: 'failed' }, { status: 'retrying' }, ({ status, error }) =>
        this.props.renderError ? (
          this.props.renderError(error, () => {
            void this.handleRetry();
          })
        ) : (
          <ErrorState
            title={this.props.errorTitle}
            message={getErrorMessage(error)}
            onRetry={
              status === 'failed'
                ? () => {
                    void this.handleRetry();
                  }
                : undefined
            }
          />
        ),
      )
      .exhaustive();
  }
}

/** 조회를 시작한 부모가 refetch를 소유하므로, 읽는 자식이 실패해도 같은 요청으로 복구한다. */
export function AsyncBoundary({ children, fallback, resetKey, ...errorProps }: IAsyncBoundaryProps) {
  return (
    <QueryErrorBoundary key={resetKey} {...errorProps}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </QueryErrorBoundary>
  );
}
