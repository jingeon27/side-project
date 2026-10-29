import { StrictMode } from 'react';

import { render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { AnalyticsTracker } from './AnalyticsTracker';

const sdk = vi.hoisted(() => ({ track: vi.fn(), pathname: '/groups/first-private-id' }));
vi.mock('next/navigation', () => ({ usePathname: () => sdk.pathname }));
vi.mock('@/shared/model/bridge', () => ({ useBridge: () => null }));
vi.mock('@amplitude/analytics-browser', () => ({
  createInstance: () => ({ init: vi.fn(), identify: vi.fn(), track: sdk.track }),
  Identify: class {
    set() {
      return this;
    }
  },
}));
afterEach(() => vi.unstubAllEnvs());

it('StrictMode에서는 한 번만 집계하고 같은 경로 패턴의 다른 그룹으로 이동하면 새 방문을 기록해야 한다', () => {
  vi.stubEnv('NEXT_PUBLIC_AMPLITUDE_API_KEY', 'test-key');
  const view = render(
    <StrictMode>
      <AnalyticsTracker />
    </StrictMode>,
  );
  expect(sdk.track.mock.calls).toEqual([['page_viewed', { path_template: '/groups/:id' }]]);

  sdk.pathname = '/groups/second-private-id';
  view.rerender(
    <StrictMode>
      <AnalyticsTracker />
    </StrictMode>,
  );
  expect(sdk.track.mock.calls).toEqual([
    ['page_viewed', { path_template: '/groups/:id' }],
    ['page_viewed', { path_template: '/groups/:id' }],
  ]);
});
