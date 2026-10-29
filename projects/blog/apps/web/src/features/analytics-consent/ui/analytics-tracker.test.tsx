import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AnalyticsTracker } from './analytics-tracker';

const state = vi.hoisted(() => ({ pathname: '/ko/blog', track: vi.fn(), apply: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));
vi.mock('@/shared/lib/analytics/events', () => ({
  trackPageView: state.track,
  applyAnalyticsConsent: state.apply,
  consentChangedEvent: 'test:consent',
  consentKey: 'test:consent-key',
}));

describe('analytics event subscriptions', () => {
  it('keeps subscriptions through route changes and tracks the latest path', () => {
    state.pathname = '/ko/blog';
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const view = render(<AnalyticsTracker />);
    const subscriptions = add.mock.calls.filter(([event]) => event === 'storage' || event === 'test:consent');
    expect(subscriptions).toHaveLength(2);
    state.pathname = '/en/blog';
    view.rerender(<AnalyticsTracker />);
    expect(add.mock.calls.filter(([event]) => event === 'storage' || event === 'test:consent')).toHaveLength(
      2,
    );
    expect(state.track).toHaveBeenLastCalledWith('/en/blog');
    act(() => window.dispatchEvent(new Event('test:consent')));
    expect(state.track).toHaveBeenLastCalledWith('/en/blog');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' })));
    expect(state.apply).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'test:consent-key' })));
    expect(state.apply).toHaveBeenCalledOnce();
    expect(state.track).toHaveBeenLastCalledWith('/en/blog');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: null })));
    expect(state.apply).toHaveBeenCalledTimes(2);
    view.unmount();
    for (const [event, callback] of subscriptions) expect(remove).toHaveBeenCalledWith(event, callback);
  });
});
