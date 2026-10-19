import { Component, Suspense, type ReactNode } from 'react';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { Button } from '@side/design-system';
interface IRegionBoundaryProps {
  children: ReactNode;
  onReset: () => void;
}
class RegionBoundary extends Component<IRegionBoundaryProps, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  handleReset = () => {
    this.props.onReset();
    this.setState({ failed: false });
  };
  render() {
    if (this.state.failed)
      return (
        <div role="alert" className="admin-error">
          <p>정보를 불러오지 못했습니다.</p>
          <Button type="button" variant="secondary" onClick={this.handleReset}>
            다시 시도
          </Button>
        </div>
      );
    return this.props.children;
  }
}
export function AsyncBoundary({ children }: { children: ReactNode }) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <RegionBoundary onReset={reset}>
          <Suspense fallback={<p role="status">불러오는 중</p>}>{children}</Suspense>
        </RegionBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="admin-error">
      {error instanceof Error ? error.message : '요청을 처리하지 못했습니다.'}
    </p>
  );
}
