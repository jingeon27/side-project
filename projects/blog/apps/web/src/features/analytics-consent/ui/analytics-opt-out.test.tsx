import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { labels } from '@/shared/config/labels';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST123');
  localStorage.clear();
  delete window.__blogAnalyticsOptedOut;
});

afterEach(() => {
  delete window.__blogAnalyticsOptedOut;
  delete window.gtag;
  vi.unstubAllEnvs();
});

it('shows collection as off and stops events when the browser cannot persist the opt-out', async () => {
  const { AnalyticsOptOut } = await import('./analytics-opt-out');
  const { trackEvent } = await import('@/shared/lib/analytics/events');
  const text = labels('ko').analytics;
  const send = vi.fn();
  window.gtag = send;
  const user = userEvent.setup();
  render(<AnalyticsOptOut locale="ko" />);
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Storage is full', 'QuotaExceededError');
  });

  await user.click(screen.getByRole('button', { name: text.disable }));
  expect(screen.getByRole('status')).toHaveTextContent(text.off);
  expect(screen.getByRole('button', { name: text.enable })).toBeVisible();
  send.mockClear();
  trackEvent('category_selected', { category_id: 'engineering' });
  expect(send).not.toHaveBeenCalled();

  write.mockRestore();
  await user.click(screen.getByRole('button', { name: text.enable }));
  expect(screen.getByRole('status')).toHaveTextContent(text.on);
  trackEvent('category_selected', { category_id: 'engineering' });
  expect(send).toHaveBeenCalledWith('event', 'category_selected', { category_id: 'engineering' });
});
