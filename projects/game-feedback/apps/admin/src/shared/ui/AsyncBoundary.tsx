import { Component, createContext, Suspense, type ContextType, type ReactNode } from 'react';

import { QueryErrorResetBoundary } from '@tanstack/react-query';

import { Button } from '@side/design-system';

/**
 * 관리자 세션을 다시 확인하거나 다시 로그인할 때 바뀌는 값. 만료 화면 뒤에 숨긴 채 실패한 영역은
 * 이 값이 바뀌면 '다시 시도' 없이 다시 불러온다. 실패하지 않은 영역은 다시 그리지 않아 초안이 남는다.
 */
export const SessionVersionContext = createContext(0);

interface IRegionBoundaryProps {
  children: ReactNode;
  onReset: () => void;
}
interface IRegionBoundaryState {
  failed: boolean;
  failedVersion: number;
}
class RegionBoundary extends Component<IRegionBoundaryProps, IRegionBoundaryState> {
  static override contextType = SessionVersionContext;
  declare context: ContextType<typeof SessionVersionContext>;
  override state = { failed: false, failedVersion: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.setState({ failedVersion: this.context });
  }
  override componentDidUpdate() {
    if (this.state.failed && this.state.failedVersion !== this.context) this.handleReset();
  }
  handleReset = () => {
    this.props.onReset();
    this.setState({ failed: false });
  };
  override render() {
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
      {({ reset: onReset }) => (
        <RegionBoundary onReset={onReset}>
          <Suspense fallback={<p role="status">불러오는 중</p>}>{children}</Suspense>
        </RegionBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
